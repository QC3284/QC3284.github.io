<script setup lang="ts">
import { ref, computed } from 'vue'
import { useConfigStore } from '@/stores/config'
import { useI18nStore } from '@/stores/i18n'
import type { ConfigurationSummary, ExportOptions } from '@/types/config'

const configStore = useConfigStore()
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

function getLocale(): string {
  const lang = (i18n.currentLanguage || 'en').replace(/_/g, '-')
  const [language, region] = lang.split('-')
  if (!region) {
    return language
  }
  return `${language}-${region.toUpperCase()}`
}

// Component state
const showSaveDialog = ref(false)
const showLoadDialog = ref(false)
const showImportDialog = ref(false)
const showExportDialog = ref(false)
const isCopyingShareLink = ref(false)
const shareSnackbar = ref(false)
const shareSnackbarMessage = ref('')
const shareSnackbarColor = ref<'success' | 'error'>('success')

const saveForm = ref({
  name: '',
  description: ''
})

const importForm = ref({
  content: '',
  format: 'json' as 'json' | 'yaml'
})

const exportForm = ref({
  configId: '',
  options: {
    includeModuleSources: true,
    includePackages: true,
    includeUciDefaults: true,
    format: 'json' as 'json' | 'yaml'
  } as ExportOptions
})

// File input ref
const fileInput = ref<HTMLInputElement>()

// Computed
const sortedConfigurations = computed(() => {
  return [...configStore.savedConfigurations].sort((a, b) => 
    new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
  )
})

// Methods
async function copyShareLink() {
  if (isCopyingShareLink.value) return

  const result = configStore.getShareConfigParam()
  if (!result.success) {
    shareSnackbarColor.value = 'error'
    shareSnackbarMessage.value = result.message || translate('config-share-generate-error', 'Failed to generate shared configuration')
    shareSnackbar.value = true
    return
  }

  const url = new URL(window.location.href)
  url.searchParams.set('config', result.value)

  const shareUrl = url.toString()
  isCopyingShareLink.value = true

  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(shareUrl)
    } else {
      const textarea = document.createElement('textarea')
      textarea.value = shareUrl
      textarea.setAttribute('readonly', '')
      textarea.style.position = 'absolute'
      textarea.style.left = '-9999px'
      document.body.appendChild(textarea)
      textarea.select()
      document.execCommand('copy')
      document.body.removeChild(textarea)
    }
    shareSnackbarColor.value = 'success'
    shareSnackbarMessage.value = translate('config-share-success', 'Link copied. You can now share this configuration.')
  } catch (error) {
    console.error('Failed to copy share link', error)
    shareSnackbarColor.value = 'error'
    shareSnackbarMessage.value = translate('config-share-copy-failed', 'Failed to copy link. Please try again.')
  } finally {
    shareSnackbar.value = true
    isCopyingShareLink.value = false
  }
}

function openSaveDialog() {
  if (configStore.currentConfigName) {
    saveForm.value.name = configStore.currentConfigName
  } else {
    const date = new Intl.DateTimeFormat(getLocale()).format(new Date())
    saveForm.value.name = translate('config-default-name', 'Configuration {date}', { date })
  }
  saveForm.value.description = ''
  showSaveDialog.value = true
}

function closeSaveDialog() {
  showSaveDialog.value = false
  saveForm.value = { name: '', description: '' }
}

async function saveConfiguration() {
  const success = await configStore.saveCurrentConfiguration(
    saveForm.value.name,
    saveForm.value.description
  )
  
  if (success) {
    closeSaveDialog()
  }
}

function openLoadDialog() {
  showLoadDialog.value = true
}

function closeLoadDialog() {
  showLoadDialog.value = false
}

async function loadConfiguration(config: ConfigurationSummary) {
  try {
    const success = await configStore.loadConfiguration(config.id)
    if (success) {
      closeLoadDialog()
    } else {
      // Error is handled by the store and displayed in the error alert
    }
  } catch (error) {
    console.error('Failed to load configuration:', error)
  }
}

function deleteConfiguration(config: ConfigurationSummary, event: Event) {
  event.stopPropagation()
  const message = translate('config-delete-confirm', 'Are you sure you want to delete configuration "{name}"?', { name: config.name })
  if (confirm(message)) {
    configStore.deleteConfiguration(config.id)
  }
}

function openImportDialog() {
  importForm.value = { content: '', format: 'json' }
  showImportDialog.value = true
}

function closeImportDialog() {
  showImportDialog.value = false
  importForm.value = { content: '', format: 'json' }
}

function importFromFile() {
  fileInput.value?.click()
}

function handleFileImport(event: Event) {
  const target = event.target as HTMLInputElement
  const file = target.files?.[0]
  if (!file) return

  const reader = new FileReader()
  reader.onload = (e) => {
    const content = e.target?.result as string
    if (content) {
      importForm.value.content = content
      importForm.value.format = file.name.endsWith('.yaml') || file.name.endsWith('.yml') ? 'yaml' : 'json'
    }
  }
  reader.readAsText(file)
}

function importConfiguration() {
  const result = configStore.importConfiguration(
    importForm.value.content,
    importForm.value.format
  )
  
  if (result.success) {
    closeImportDialog()
    if (result.warnings?.length) {
      const warningText = result.warnings.join('\n')
    alert(translate('config-import-warning', 'Imported successfully, but with warnings:\n{warnings}', { warnings: warningText }))
    }
  } else {
    alert(result.message)
  }
}

function openExportDialog(config: ConfigurationSummary) {
  exportForm.value.configId = config.id
  showExportDialog.value = true
}

function closeExportDialog() {
  showExportDialog.value = false
  exportForm.value = {
    configId: '',
    options: {
      includeModuleSources: true,
      includePackages: true,
      includeUciDefaults: true,
      format: 'json'
    }
  }
}

function exportConfiguration() {
  configStore.exportConfiguration(exportForm.value.configId, exportForm.value.options)
  closeExportDialog()
}

function formatDate(date: Date): string {
  return new Intl.DateTimeFormat(getLocale(), {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  }).format(date)
}
</script>

<template>
  <div>
    <!-- Toolbar -->
    <v-card class="mb-4">
      <v-card-title class="d-flex align-center">
        <v-icon icon="mdi-cog-box" class="mr-2" />
        {{ i18n.t('config-manager-title', 'Configuration Manager') }}
        <v-spacer />
        
        <!-- Desktop buttons -->
        <div v-if="!$vuetify.display.mobile" class="d-flex">
          <v-btn
            variant="outlined"
            prepend-icon="mdi-content-save"
            @click="openSaveDialog"
            class="mr-3"
          >
            {{ i18n.t('config-save', 'Save Configuration') }}
          </v-btn>
          <v-btn
            variant="outlined"
            prepend-icon="mdi-folder-open"
            @click="openLoadDialog"
            class="mr-3"
          >
            {{ i18n.t('config-load', 'Load Configuration') }}
          </v-btn>
          <v-btn
            variant="outlined"
            prepend-icon="mdi-link-variant"
            :loading="isCopyingShareLink"
            @click="copyShareLink"
            class="mr-3"
          >
            {{ i18n.t('config-copy-link', 'Copy Share Link') }}
          </v-btn>
          <v-btn
            variant="outlined"
            prepend-icon="mdi-import"
            @click="openImportDialog"
          >
            {{ i18n.t('config-import', 'Import Configuration') }}
          </v-btn>
        </div>
        
        <!-- Mobile buttons -->
        <div v-else class="d-flex">
          <v-btn
            icon="mdi-content-save"
            variant="outlined"
            @click="openSaveDialog"
            class="mr-2"
          />
          <v-btn
            icon="mdi-folder-open"
            variant="outlined"
            @click="openLoadDialog"
            class="mr-2"
          />
          <v-btn
            icon="mdi-link-variant"
            variant="outlined"
            :disabled="isCopyingShareLink"
            @click="copyShareLink"
            class="mr-2"
          />
          <v-btn
            icon="mdi-import"
            variant="outlined"
            @click="openImportDialog"
          />
        </div>
      </v-card-title>

    </v-card>

    <!-- Error Alert -->
    <v-alert
      v-if="configStore.error"
      type="error"
      dismissible
      @click:close="configStore.clearError"
      class="mb-4"
    >
      {{ configStore.error }}
    </v-alert>

    <!-- Save Dialog -->
    <v-dialog v-model="showSaveDialog" max-width="500px">
      <v-card>
        <v-card-title>{{ i18n.t('config-save', 'Save Configuration') }}</v-card-title>
        <v-card-text>
          <v-form>
            <v-text-field
              v-model="saveForm.name"
              :label="i18n.t('config-name-label', 'Configuration name')"
              required
              variant="outlined"
            />
            <v-textarea
              v-model="saveForm.description"
              :label="i18n.t('config-description-label', 'Description (optional)')"
              variant="outlined"
              rows="3"
            />
          </v-form>
        </v-card-text>
        <v-card-actions>
          <v-spacer />
          <v-btn @click="closeSaveDialog">{{ i18n.t('common-cancel', 'Cancel') }}</v-btn>
          <v-btn
            color="primary"
            :loading="configStore.isLoading"
            :disabled="!saveForm.name"
            @click="saveConfiguration"
          >
            {{ i18n.t('common-save', 'Save') }}
          </v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>

    <!-- Load Dialog -->
    <v-dialog v-model="showLoadDialog" max-width="800px" scrollable>
      <v-card>
        <v-card-title>{{ i18n.t('config-load', 'Load Configuration') }}</v-card-title>
        <v-card-text>
          <div v-if="sortedConfigurations.length === 0" class="text-center py-8">
            <v-icon icon="mdi-folder-open-outline" size="64" color="grey-lighten-1" />
            <p class="text-h6 mt-4 text-grey">{{ i18n.t('config-none-saved', 'No saved configurations') }}</p>
          </div>

          <v-list v-else lines="three">
            <v-list-item
              v-for="config in sortedConfigurations"
              :key="config.id"
              @click="loadConfiguration(config)"
              :disabled="configStore.isLoading"
              class="mb-2"
            >
              <template #prepend>
                <v-avatar color="primary">
                  <v-icon icon="mdi-cog" />
                </v-avatar>
              </template>

              <v-list-item-title>{{ config.name }}</v-list-item-title>
              <v-list-item-subtitle>
                <div>{{ config.description || i18n.t('config-no-description', 'No description') }}</div>
                <div class="text-caption">
                  <strong>{{ i18n.t('config-device-label', 'Device') }}:</strong> {{ config.deviceModel }} | 
                  <strong>{{ i18n.t('config-version-label', 'Version') }}:</strong> {{ config.version }} | 
                  <strong>{{ i18n.t('config-module-label', 'Modules') }}:</strong> {{ config.moduleCount }} | 
                  <strong>{{ i18n.t('config-package-label', 'Packages') }}:</strong> {{ config.packageCount }}
                </div>
                <div class="text-caption text-medium-emphasis">
                  {{ i18n.t('config-updated-label', 'Updated') }}: {{ formatDate(config.updatedAt) }}
                </div>
              </v-list-item-subtitle>

              <template #append>
                <div class="d-flex align-center">
                  <v-btn
                    icon="mdi-export"
                    variant="text"
                    size="small"
                    @click="openExportDialog(config)"
                  />
                  <v-btn
                    icon="mdi-delete"
                    variant="text"
                    size="small"
                    color="error"
                    @click="deleteConfiguration(config, $event)"
                  />
                </div>
              </template>
            </v-list-item>
          </v-list>
        </v-card-text>
        
        <v-progress-linear 
          v-if="configStore.isLoading" 
          indeterminate 
          color="primary"
        />
        
        <v-card-actions>
          <div v-if="configStore.isLoading" class="text-body-2 text-medium-emphasis">
            {{ i18n.t('config-loading', 'Loading configuration, please wait...') }}
          </div>
          <v-spacer />
          <v-btn 
            @click="closeLoadDialog"
            :disabled="configStore.isLoading"
          >
            {{ i18n.t('common-close', 'Close') }}
          </v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>

    <!-- Import Dialog -->
    <v-dialog v-model="showImportDialog" max-width="600px" scrollable>
      <v-card>
        <v-card-title>{{ i18n.t('config-import', 'Import Configuration') }}</v-card-title>
        <v-card-text>
          <div class="mb-4">
            <v-btn
              variant="outlined"
              prepend-icon="mdi-file"
              @click="importFromFile"
              class="mr-2"
            >
              {{ i18n.t('config-import-choose-file', 'Choose File') }}
            </v-btn>
            <v-select
              v-model="importForm.format"
              :items="[
                { title: 'JSON', value: 'json' },
                { title: 'YAML', value: 'yaml' }
              ]"
              :label="i18n.t('config-import-format', 'Format')"
              variant="outlined"
              density="compact"
              style="max-width: 150px; display: inline-block;"
            />
          </div>

          <v-textarea
            v-model="importForm.content"
            :label="i18n.t('config-import-content', 'Configuration content')"
            variant="outlined"
            rows="10"
            :placeholder="i18n.t('config-import-placeholder', 'Paste configuration content or choose a file...')"
          />

          <input
            ref="fileInput"
            type="file"
            accept=".json,.yaml,.yml"
            style="display: none"
            @change="handleFileImport"
          />
        </v-card-text>
        <v-card-actions>
          <v-spacer />
          <v-btn @click="closeImportDialog">{{ i18n.t('common-cancel', 'Cancel') }}</v-btn>
          <v-btn
            color="primary"
            :disabled="!importForm.content"
            @click="importConfiguration"
          >
            {{ i18n.t('common-import', 'Import') }}
          </v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>

    <!-- Export Dialog -->
    <v-dialog v-model="showExportDialog" max-width="500px">
      <v-card>
        <v-card-title>{{ i18n.t('config-export', 'Export Configuration') }}</v-card-title>
        <v-card-text>
          <v-form>
            <v-select
              v-model="exportForm.options.format"
              :items="[
                { title: 'JSON', value: 'json' },
                { title: 'YAML', value: 'yaml' }
              ]"
              :label="i18n.t('config-export-format', 'Export format')"
              variant="outlined"
            />

            <div class="mt-4">
              <p class="text-subtitle-2 mb-2">{{ i18n.t('config-export-content', 'Export content') }}:</p>
              <v-checkbox
                v-model="exportForm.options.includeModuleSources"
                :label="i18n.t('config-export-include-modules', 'Include module sources')"
                density="compact"
              />
              <v-checkbox
                v-model="exportForm.options.includePackages"
                :label="i18n.t('config-export-include-packages', 'Include package list')"
                density="compact"
              />
              <v-checkbox
                v-model="exportForm.options.includeUciDefaults"
                :label="i18n.t('config-export-include-uci', 'Include UCI defaults')"
                density="compact"
              />
            </div>
          </v-form>
        </v-card-text>
        <v-card-actions>
          <v-spacer />
          <v-btn @click="closeExportDialog">{{ i18n.t('common-cancel', 'Cancel') }}</v-btn>
          <v-btn
            color="primary"
            @click="exportConfiguration"
          >
            {{ i18n.t('common-export', 'Export') }}
          </v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>

    <v-snackbar
      v-model="shareSnackbar"
      :color="shareSnackbarColor"
      timeout="3000"
      location="bottom"
    >
      {{ shareSnackbarMessage }}
    </v-snackbar>
  </div>
</template>
