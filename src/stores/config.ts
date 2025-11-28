// Configuration management store

import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { useFirmwareStore } from './firmware'
import { useModuleStore } from './module'
import { usePackageStore } from './package'
import { useCustomBuildStore } from './customBuild'
import { useI18nStore } from './i18n'
import { configManager } from '@/services/configManager'
import { config } from '@/config'
import { encodeConfigurationForUrl, decodeConfigurationFromUrl } from '@/services/urlConfig'
import type { 
  SavedConfiguration, 
  ConfigurationSummary, 
  ImportResult,
  ExportOptions 
} from '@/types/config'

// Helper function to wait for a condition with reactive state
function waitForCondition(conditionFn: () => boolean, timeout = 5000): Promise<boolean> {
  return new Promise(resolve => {
    if (conditionFn()) {
      resolve(true)
      return
    }
    
    const interval = setInterval(() => {
      if (conditionFn()) {
        clearInterval(interval)
        resolve(true)
      }
    }, 100)
    
    setTimeout(() => {
      clearInterval(interval)
      resolve(false)
    }, timeout)
  })
}

export const useConfigStore = defineStore('config', () => {
  // State
  const savedConfigurations = ref<ConfigurationSummary[]>([])
  const currentConfigId = ref<string>('')
  const currentConfigName = ref<string>('')
  const isLoading = ref(false)
  const error = ref<string>('')
  const skipAutoLoad = ref(false)

  // Get other stores
  const firmwareStore = useFirmwareStore()
  const moduleStore = useModuleStore()
  const packageStore = usePackageStore()
  const customBuildStore = useCustomBuildStore()
  const i18n = useI18nStore()

  function translate(key: string, fallback: string, replacements?: Record<string, string>) {
    let text = i18n.t(key, fallback)
    if (replacements) {
      for (const [token, value] of Object.entries(replacements)) {
        text = text.replace(new RegExp(`{${token}}`, 'g'), value)
      }
    }
    return text
  }

  // Computed
  const hasCurrentConfig = computed(() => !!currentConfigId.value)
  const currentConfigSummary = computed(() => {
    return savedConfigurations.value.find(c => c.id === currentConfigId.value)
  })

  // Actions
  function loadSavedConfigurations() {
    try {
      savedConfigurations.value = configManager.getConfigurationSummaries()
    } catch (err) {
      error.value = translate('config-error-load-list', 'Failed to load configuration list')
      console.error(err)
    }
  }

  function disableAutoLoad() {
    skipAutoLoad.value = true
  }

  function enableAutoLoad() {
    skipAutoLoad.value = false
  }

  function generateConfigId(prefix = 'config'): string {
    return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`
  }

  function buildConfigurationData(
    name: string,
    description?: string,
    options?: { forShare?: boolean }
  ): SavedConfiguration {
    if (!firmwareStore.selectedDevice || !firmwareStore.selectedProfile) {
      throw new Error(translate('config-error-select-device', 'Please select a device first'))
    }

    const useExistingId = !options?.forShare && currentConfigId.value
    const id = useExistingId ? currentConfigId.value : generateConfigId(options?.forShare ? 'share' : 'config')
    const createdAt = useExistingId
      ? currentConfigSummary.value?.createdAt || new Date()
      : new Date()
    const customBuildData = customBuildStore.getSnapshot()

    const baseConfig: SavedConfiguration = {
      id,
      name,
      description,
      version: '1.0.0',
      createdAt,
      updatedAt: new Date(),

      device: {
        model: firmwareStore.selectedDevice.title,
        target: firmwareStore.selectedDevice.target,
        profile: firmwareStore.selectedProfile.id,
        version: firmwareStore.currentVersion || 'latest'
      },

      customBuild: customBuildData,

      ...(config.enable_module_management
        ? {
            modules: {
              sources: moduleStore.sources.map(source => ({
                id: source.id,
                name: source.name,
                url: source.url,
                ref: source.ref
              })),
              selections: moduleStore.selections.map(selection => ({
                sourceId: selection.sourceId,
                moduleId: selection.moduleId,
                parameters: { ...selection.parameters },
                userDownloads: { ...selection.userDownloads }
              }))
            }
          }
        : {})
    }

    return baseConfig
  }

  async function saveCurrentConfiguration(name: string, description?: string): Promise<boolean> {
    if (!firmwareStore.selectedDevice || !firmwareStore.selectedProfile) {
      error.value = translate('config-error-select-device', 'Please select a device first')
      return false
    }

    isLoading.value = true
    error.value = ''

    try {
      const configData = buildConfigurationData(name, description)

      const success = configManager.saveConfiguration(configData)
      if (success) {
        currentConfigId.value = configData.id
        currentConfigName.value = configData.name
        loadSavedConfigurations()
        return true
      } else {
        error.value = translate('config-error-save', 'Failed to save configuration')
        return false
      }
    } catch (err) {
      error.value = translate('config-error-save-generic', 'An error occurred while saving the configuration')
      console.error(err)
      return false
    } finally {
      isLoading.value = false
    }
  }

  async function applyConfigurationState(
    savedConfig: SavedConfiguration,
    options?: { markAsShared?: boolean }
  ): Promise<boolean> {
    // Apply device configuration
    await firmwareStore.changeVersion(savedConfig.device.version)

    const devicesLoaded = await waitForCondition(
      () => Object.keys(firmwareStore.devices).length > 0
    )

    if (!devicesLoaded) {
      error.value = translate('config-error-device-list', 'Failed to load device list, please try again')
      return false
    }

    const device = firmwareStore.devices[savedConfig.device.model]
    if (!device) {
      error.value = translate('config-error-device-missing', 'Device not found: {model}. It may be incompatible or offline', {
        model: savedConfig.device.model
      })
      return false
    }

    await firmwareStore.selectDevice(savedConfig.device.model)

    await waitForCondition(() => !!firmwareStore.selectedProfile)

    if (packageStore.totalPackages === 0 && firmwareStore.selectedProfile) {
      await packageStore.loadPackagesForDevice(
        savedConfig.device.version,
        firmwareStore.selectedProfile.arch_packages,
        savedConfig.device.target
      )
    }

    if (config.enable_module_management && savedConfig.modules) {
      moduleStore.sources = []
      moduleStore.selections = []

      for (const sourceConfig of savedConfig.modules.sources) {
        try {
          await moduleStore.addModuleSource(
            sourceConfig.url,
            sourceConfig.name,
            sourceConfig.ref
          )
        } catch (err) {
          console.warn(`Failed to load module source: ${sourceConfig.name}`, err)
        }
      }

      await new Promise(resolve => setTimeout(resolve, 500))

      for (const selectionConfig of savedConfig.modules.selections) {
        try {
          moduleStore.selectModule(selectionConfig.sourceId, selectionConfig.moduleId)

          for (const [key, value] of Object.entries(selectionConfig.parameters)) {
            moduleStore.updateModuleParameter(
              selectionConfig.sourceId,
              selectionConfig.moduleId,
              key,
              value as string
            )
          }

          for (const [name, url] of Object.entries(selectionConfig.userDownloads)) {
            moduleStore.updateUserDownload(
              selectionConfig.sourceId,
              selectionConfig.moduleId,
              name,
              url as string
            )
          }
        } catch (err) {
          console.warn(`Failed to apply module selection: ${selectionConfig.moduleId}`, err)
        }
      }
    }

    customBuildStore.applySnapshot(savedConfig.customBuild)

    if (options?.markAsShared) {
      currentConfigId.value = ''
      currentConfigName.value = savedConfig.name || translate('config-shared', 'Shared Configuration')
    } else {
      currentConfigId.value = savedConfig.id
      currentConfigName.value = savedConfig.name
      configManager.setLastUsedConfigId(savedConfig.id)
    }

    return true
  }

  async function loadConfiguration(id: string): Promise<boolean> {
    isLoading.value = true
    error.value = ''

    try {
      const savedConfig = configManager.loadConfiguration(id)
      if (!savedConfig) {
        error.value = translate('config-error-missing', 'Configuration not found')
        return false
      }
      const success = await applyConfigurationState(savedConfig)
      return success
    } catch (err) {
      error.value = translate('config-error-load', 'Failed to load configuration')
      console.error(err)
      return false
    } finally {
      isLoading.value = false
    }
  }

  async function loadSharedConfiguration(encoded: string): Promise<boolean> {
    isLoading.value = true
    error.value = ''

    try {
      const sharedConfig = decodeConfigurationFromUrl(encoded)
      if (!sharedConfig) {
        error.value = translate('config-error-shared-invalid', 'The configuration in the link is invalid or has expired')
        return false
      }

      const success = await applyConfigurationState(sharedConfig, { markAsShared: true })
      return success
    } catch (err) {
      error.value = translate('config-error-load-shared', 'Failed to load shared configuration')
      console.error(err)
      return false
    } finally {
      isLoading.value = false
    }
  }

  function getShareConfigParam() {
    try {
      const name = currentConfigName.value
        || firmwareStore.selectedDevice?.title
        || translate('config-shared', 'Shared Configuration')

      const snapshot = buildConfigurationData(name, undefined, { forShare: true })
      const encoded = encodeConfigurationForUrl(snapshot)
      return { success: true as const, value: encoded }
    } catch (err) {
      const message = err instanceof Error ? err.message : translate('config-error-share-generate', 'Failed to generate shared configuration')
      error.value = message
      return { success: false as const, message }
    }
  }

  function deleteConfiguration(id: string): boolean {
    try {
      const success = configManager.deleteConfiguration(id)
      if (success) {
        if (currentConfigId.value === id) {
          currentConfigId.value = ''
          currentConfigName.value = ''
        }
        loadSavedConfigurations()
        
        // Auto-load next most recent config if available
        const configs = savedConfigurations.value
        if (configs.length > 0) {
          const nextConfig = configs.sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime())[0]
          loadConfiguration(nextConfig.id)
        }
      }
      return success
    } catch (err) {
      error.value = translate('config-error-delete', 'Failed to delete configuration')
      console.error(err)
      return false
    }
  }

  function exportConfiguration(id: string, options?: ExportOptions): void {
    try {
      const config = configManager.loadConfiguration(id)
      if (config) {
        configManager.downloadConfiguration(config, options)
      } else {
        error.value = translate('config-error-missing', 'Configuration not found')
      }
    } catch (err) {
      error.value = translate('config-error-export', 'Failed to export configuration')
      console.error(err)
    }
  }

  function importConfiguration(content: string, format?: 'json' | 'yaml'): ImportResult {
    try {
      const result = configManager.importConfiguration(content, format)
      if (result.success && result.config) {
        // Save imported configuration
        configManager.saveConfiguration(result.config)
        loadSavedConfigurations()
      }
      return result
    } catch {
      return {
        success: false,
        message: translate('config-error-import', 'Failed to import configuration')
      }
    }
  }

  function newConfiguration(): void {
    currentConfigId.value = ''
    currentConfigName.value = ''
    
    // Clear all selections
    firmwareStore.selectedDevice = null
    firmwareStore.selectedProfile = null
    
    // Clear package selections
    packageStore.clearAllPackages()
    customBuildStore.reset()
    
    // Clear module selections (only if module management is enabled)
    if (config.enable_module_management) {
      moduleStore.sources = []
      moduleStore.selections = []
    }
    
    // Clear last used configuration when creating new one
    configManager.clearLastUsedConfigId()
  }

  function clearError(): void {
    error.value = ''
  }

  // Auto-load last used configuration on startup
  async function autoLoadLastConfig(force = false): Promise<void> {
    if (!force && skipAutoLoad.value) {
      return
    }

    const lastConfigId = configManager.getLastUsedConfigId()
    if (lastConfigId) {
      const config = configManager.loadConfiguration(lastConfigId)
      if (config) {
        await loadConfiguration(lastConfigId)
      } else {
        // Config was deleted, clear the reference
        configManager.clearLastUsedConfigId()
      }
    }
  }

  // Initialize
  loadSavedConfigurations()
  // Auto-load last config after a short delay to ensure other stores are initialized
  setTimeout(autoLoadLastConfig, 100)

  return {
    // State
    savedConfigurations,
    currentConfigId,
    currentConfigName,
    isLoading,
    error,

    // Computed
    hasCurrentConfig,
    currentConfigSummary,

    // Actions
    loadSavedConfigurations,
    saveCurrentConfiguration,
    loadConfiguration,
    loadSharedConfiguration,
    deleteConfiguration,
    exportConfiguration,
    importConfiguration,
    newConfiguration,
    clearError,
    getShareConfigParam,
    autoLoadLastConfig,
    disableAutoLoad,
    enableAutoLoad
  }
})
