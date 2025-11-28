<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import { usePackageStore } from '@/stores/package'
import { useFirmwareStore } from '@/stores/firmware'
import { packageManager } from '@/services/packageManager'
import type { OpenWrtPackage } from '@/types/package'
import PackageDetailDialog from './PackageDetailDialog.vue'
import { useI18nStore } from '@/stores/i18n'

const packageStore = usePackageStore()
const firmwareStore = useFirmwareStore()
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

// Component state
const searchInput = ref('')
const showAddDialog = ref(false)
const showBulkAddDialog = ref(false)
const selectedPackageDetail = ref<OpenWrtPackage | null>(null)
const showPackageDetail = ref(false)
const bulkInput = ref('')
const bulkValidationResult = ref<{ found: string[]; missing: string[] } | null>(null)
const bulkValidationError = ref('')
const bulkRequiresConfirmation = ref(false)
const bulkConfirmationSignature = ref('')

// Debounced search
const searchDebounce = ref<NodeJS.Timeout>()
watch(searchInput, (newValue) => {
  clearTimeout(searchDebounce.value)
  searchDebounce.value = setTimeout(() => {
    packageStore.setSearchQuery(newValue)
  }, 300)
})

// Use a Map to cache package status to avoid repeated calculations
const packageStatusCache = ref(new Map<string, string>())

// Computed with optimized caching
const displayPackages = computed(() => {
  const packages = packageStore.filteredPackages.slice(0, 50)
  
  // Update cache only for visible packages
  packages.forEach(pkg => {
    if (!packageStatusCache.value.has(pkg.name)) {
      packageStatusCache.value.set(pkg.name, packageStore.getPackageStatus(pkg.name))
    }
  })
  
  return packages
})

// More granular cache invalidation - only clear cache for changed packages
watch(() => packageStore.selectedPackagesList, (newSelected, oldSelected) => {
  if (oldSelected) {
    // Find packages that were added or removed
    const added = newSelected.filter(pkg => !oldSelected.includes(pkg))
    const removed = oldSelected.filter(pkg => !newSelected.includes(pkg))
    
    // Only clear cache for changed packages
    const changedPackages = [...added, ...removed]
    changedPackages.forEach(pkg => {
      packageStatusCache.value.delete(pkg)
    })
  } else {
    // First time, clear all cache
    packageStatusCache.value.clear()
  }
})

watch(() => packageStore.removedPackagesList, (newRemoved, oldRemoved) => {
  if (oldRemoved) {
    // Find packages that were added or removed from removed list
    const added = newRemoved.filter(pkg => !oldRemoved.includes(pkg))
    const removed = oldRemoved.filter(pkg => !newRemoved.includes(pkg))
    
    // Only clear cache for changed packages
    const changedPackages = [...added, ...removed]
    changedPackages.forEach(pkg => {
      packageStatusCache.value.delete(pkg)
    })
  } else {
    // First time, clear all cache
    packageStatusCache.value.clear()
  }
})

watch(bulkInput, () => {
  bulkValidationResult.value = null
  bulkValidationError.value = ''
  bulkRequiresConfirmation.value = false
  bulkConfirmationSignature.value = ''
})

const totalSize = computed(() => {
  return packageStore.getTotalSize()
})

// Methods
function openAddDialog() {
  // Auto-load packages if not loaded and device is selected
  if (packageStore.totalPackages === 0 && firmwareStore.selectedDevice) {
    loadPackagesForCurrentDevice()
  }
  showAddDialog.value = true
}

function closeAddDialog() {
  showAddDialog.value = false
  packageStore.clearFilters()
  searchInput.value = ''
}

function openBulkAddDialog() {
  if (packageStore.totalPackages === 0 && firmwareStore.selectedDevice) {
    loadPackagesForCurrentDevice()
  }
  showBulkAddDialog.value = true
  bulkInput.value = ''
  bulkValidationResult.value = null
  bulkValidationError.value = ''
  bulkRequiresConfirmation.value = false
  bulkConfirmationSignature.value = ''
}

function closeBulkAddDialog() {
  showBulkAddDialog.value = false
  bulkInput.value = ''
  bulkValidationResult.value = null
  bulkValidationError.value = ''
  bulkRequiresConfirmation.value = false
  bulkConfirmationSignature.value = ''
}

async function loadPackagesForCurrentDevice() {
  if (!firmwareStore.selectedDevice || !firmwareStore.currentVersion) {
    return
  }

  const architecture = getDeviceArchitecture()
  if (architecture) {
    await packageStore.loadPackagesForDevice(
      firmwareStore.currentVersion, 
      architecture, 
      firmwareStore.selectedDevice.target
    )
  }
}

function getDeviceArchitecture(): string | null {
  // arch_packages is always present when a profile is selected
  if (firmwareStore.selectedProfile) {
    return firmwareStore.selectedProfile.arch_packages
  }
  // Warn when no profile is selected
  if (firmwareStore.selectedDevice) {
    console.warn(`Profile not loaded for device: ${firmwareStore.selectedDevice.title}, cannot determine architecture`)
  }
  return null
}

function addPackage(packageName: string) {
  packageStore.addPackage(packageName)
  // Remove from removed list if it was there
  packageStore.removeRemovedPackage(packageName)
}

function removePackage(packageName: string) {
  // Use the smart toggle logic that handles both default and non-default packages
  packageStore.togglePackage(packageName)
}

function showPackageDetails(pkg: OpenWrtPackage | null) {
  selectedPackageDetail.value = pkg
  showPackageDetail.value = true
}

function closePackageDetail() {
  showPackageDetail.value = false
  selectedPackageDetail.value = null
}

function validateBulkPackages(): { found: string[]; missing: string[] } | null {
  bulkValidationError.value = ''
  const names = bulkInput.value
    .split(/\s+/)
    .map(name => name.trim())
    .filter(Boolean)

  if (names.length === 0) {
    bulkValidationResult.value = null
    bulkValidationError.value = translate('package-manager-bulk-empty', 'Please enter at least one package name')
    bulkConfirmationSignature.value = ''
    bulkRequiresConfirmation.value = false
    return null
  }

  const uniqueNames = Array.from(new Set(names))
  const availablePackages = new Set(packageStore.allPackages.map(pkg => pkg.name))
  const signature = uniqueNames.join('|')

  if (signature !== bulkConfirmationSignature.value) {
    bulkRequiresConfirmation.value = false
  }
  bulkConfirmationSignature.value = signature

  const found = uniqueNames.filter(name => availablePackages.has(name))
  const missing = uniqueNames.filter(name => !availablePackages.has(name))

  bulkValidationResult.value = { found, missing }

  if (found.length === 0) {
    bulkValidationError.value = translate('package-manager-bulk-none-valid', 'None of the entered packages exist in the current feed list')
    return null
  }

  return { found, missing }
}

function applyBulkAdd(packages: string[]) {
  packages.forEach(pkgName => {
    if (packageStore.isPackageInDefaults(pkgName)) {
      packageStore.removeRemovedPackage(pkgName)
    } else {
      packageStore.addPackage(pkgName)
    }
  })
  closeBulkAddDialog()
}

function submitBulkAdd() {
  const result = validateBulkPackages()

  if (!result) {
    return
  }

  const { found, missing } = result

  if (missing.length > 0 && !bulkRequiresConfirmation.value) {
    bulkRequiresConfirmation.value = true
    return
  }

  applyBulkAdd(found)
  bulkRequiresConfirmation.value = false
  bulkConfirmationSignature.value = ''
}


function formatSize(bytes: number) {
  return packageManager.formatSize(bytes)
}

function getSectionName(section: string) {
  return packageManager.getSectionDisplayName(section)
}

function getFeedName(feedName: string) {
  return packageManager.getFeedDisplayName(feedName)
}

function clearAllPackages() {
  packageStore.clearAllPackages()
}

// Optimized functions using cache
function getCachedPackageStatus(packageName: string): string {
  if (!packageStatusCache.value.has(packageName)) {
    packageStatusCache.value.set(packageName, packageStore.getPackageStatus(packageName))
  }
  return packageStatusCache.value.get(packageName)!
}

function getPackageIcon(packageName: string): string {
  const status = getCachedPackageStatus(packageName)
  switch (status) {
    case 'selected': return 'mdi-check-circle'
    case 'removed': return 'mdi-package-variant-remove'
    case 'default': return 'mdi-package-variant'
    default: return 'mdi-package-variant-plus'
  }
}

function getPackageColor(packageName: string): string {
  const status = getCachedPackageStatus(packageName)
  switch (status) {
    case 'selected': return 'primary'
    case 'removed': return 'error'
    case 'default': return 'secondary'
    default: return 'grey'
  }
}

function getPackageBackgroundClass(packageName: string): string {
  const status = getCachedPackageStatus(packageName)
  switch (status) {
    case 'selected': return 'bg-primary-container'
    case 'removed': return 'bg-error-container'
    case 'default': return 'bg-secondary-container'
    default: return ''
  }
}

// Note: Package loading is triggered by FirmwareSelector after device selection
</script>

<template>
  <v-card>
    <v-card-title class="package-manager-title d-flex align-center flex-wrap">
      <v-icon icon="mdi-package-variant" class="mr-2" />
      {{ i18n.t('package-manager-title', 'Package Manager') }}
      <div class="package-manager-actions d-flex">
        <v-btn
          color="primary"
          variant="tonal"
          prepend-icon="mdi-playlist-plus"
          class="package-action-btn"
          @click="openBulkAddDialog"
          :disabled="!firmwareStore.selectedDevice"
        >
          {{ i18n.t('package-manager-bulk-open', 'Batch Add Packages') }}
        </v-btn>
        <v-btn
          color="primary"
          prepend-icon="mdi-plus"
          class="package-action-btn"
          @click="openAddDialog"
          :disabled="!firmwareStore.selectedDevice"
        >
          {{ i18n.t('package-manager-add', 'Add Packages') }}
        </v-btn>
      </div>
    </v-card-title>

    <v-card-text>
      <!-- Selected packages list -->
      <div v-if="packageStore.selectedPackagesList.length === 0 && packageStore.removedPackagesList.length === 0" class="text-center py-4">
        <v-icon icon="mdi-package-variant-closed" size="48" color="grey-lighten-1" />
        <p class="text-body-1 mt-2 text-grey">{{ i18n.t('package-manager-empty', 'No packages selected yet') }}</p>
        <p class="text-caption text-grey">{{ i18n.t('package-manager-empty-hint', 'Click "Add Packages" to start choosing') }}</p>
      </div>

      <div v-else>
        <!-- Summary -->
        <div class="mb-4">
          <div class="d-flex align-center justify-space-between mb-3">
            <div class="text-subtitle-2 text-medium-emphasis">
              {{ i18n.t('package-manager-summary-title', 'Package Summary') }}
            </div>
            <v-btn
              size="small"
              variant="outlined"
              color="error"
              @click="clearAllPackages"
            >
              {{ i18n.t('package-manager-clear-all', 'Clear All') }}
            </v-btn>
          </div>
          
          <!-- Package count info in rows for better mobile layout -->
          <v-row dense>
            <v-col cols="6" sm="3">
              <v-chip color="primary" variant="tonal" size="small" class="w-100 justify-center">
                {{ translate('package-manager-selected-count', 'Selected {count}', { count: String(packageStore.selectedPackagesList.length) }) }}
              </v-chip>
            </v-col>
            <v-col cols="6" sm="3" v-if="packageStore.removedPackagesList.length > 0">
              <v-chip color="error" variant="tonal" size="small" class="w-100 justify-center">
                {{ translate('package-manager-removed-count', 'Removed {count}', { count: String(packageStore.removedPackagesList.length) }) }}
              </v-chip>
            </v-col>
            <v-col cols="6" sm="3">
              <v-chip color="info" variant="tonal" size="small" class="w-100 justify-center">
                {{ translate('package-manager-download-size', 'Download: {size}', { size: formatSize(totalSize.downloadSize) }) }}
              </v-chip>
            </v-col>
            <v-col cols="6" sm="3">
              <v-chip color="warning" variant="tonal" size="small" class="w-100 justify-center">
                {{ translate('package-manager-install-size', 'Install: {size}', { size: formatSize(totalSize.installedSize) }) }}
              </v-chip>
            </v-col>
          </v-row>
        </div>

        <!-- Package lists -->
        <v-list lines="two">
          <!-- Selected packages -->
          <template v-for="packageName in packageStore.selectedPackagesList" :key="'selected-' + packageName">
            <v-list-item>
              <template #prepend>
                <v-icon icon="mdi-package-variant" color="primary" />
              </template>

              <v-list-item-title>{{ packageName }}</v-list-item-title>
              <v-list-item-subtitle>
                <span v-if="packageStore.getPackageInfo(packageName)">
                  {{ packageStore.getPackageInfo(packageName)!.description }}
                </span>
                <span v-else class="text-medium-emphasis">{{ i18n.t('package-manager-loading', 'Loading...') }}</span>
              </v-list-item-subtitle>

              <template #append>
                <div class="d-flex align-center">
                  <v-btn
                    icon="mdi-information-outline"
                    variant="text"
                    size="small"
                    @click="showPackageDetails(packageStore.getPackageInfo(packageName) || null)"
                    v-if="packageStore.getPackageInfo(packageName)"
                  />
                  <v-btn
                    :icon="packageStore.isPackageInDefaults(packageName) ? 'mdi-delete' : 'mdi-close'"
                    variant="text"
                    size="small"
                    color="error"
                    :title="packageStore.isPackageInDefaults(packageName)
                      ? i18n.t('package-manager-action-exclude-default', 'Exclude from default packages')
                      : i18n.t('package-manager-action-deselect', 'Deselect')"
                    @click="removePackage(packageName)"
                  />
                </div>
              </template>
            </v-list-item>
          </template>

          <!-- Divider if both lists exist -->
          <v-divider v-if="packageStore.selectedPackagesList.length > 0 && packageStore.removedPackagesList.length > 0" class="my-2" />

          <!-- Removed packages -->
          <template v-for="packageName in packageStore.removedPackagesList" :key="'removed-' + packageName">
            <v-list-item class="bg-error-container/10">
              <template #prepend>
                <v-icon icon="mdi-package-variant-remove" color="error" />
              </template>

              <v-list-item-title class="text-decoration-line-through text-error">
                -{{ packageName }}
              </v-list-item-title>
              <v-list-item-subtitle class="text-error">
                <span v-if="packageStore.getPackageInfo(packageName)">
                  {{ packageStore.getPackageInfo(packageName)!.description }}
                </span>
                <span v-else class="text-medium-emphasis">{{ i18n.t('package-manager-will-remove', 'This package will be removed during build') }}</span>
              </v-list-item-subtitle>

              <template #append>
                <div class="d-flex align-center">
                  <v-btn
                    icon="mdi-information-outline"
                    variant="text"
                    size="small"
                    @click="showPackageDetails(packageStore.getPackageInfo(packageName) || null)"
                    v-if="packageStore.getPackageInfo(packageName)"
                  />
                    <v-btn
                    icon="mdi-restore"
                    variant="text"
                    size="small"
                    color="success"
                    :title="i18n.t('package-manager-action-restore-default', 'Restore to default')"
                    @click="packageStore.removeRemovedPackage(packageName)"
                  />
                </div>
              </template>
            </v-list-item>
          </template>
        </v-list>
      </div>
    </v-card-text>

    <!-- Add Package Dialog -->
    <v-dialog v-model="showAddDialog" max-width="1000px" scrollable>
      <v-card>
        <v-card-title class="d-flex align-center">
          <v-icon icon="mdi-package-variant-plus" class="mr-2" />
          {{ i18n.t('package-manager-add', 'Add Packages') }}
          <v-spacer />
          <v-btn
            icon="mdi-close"
            variant="text"
            size="small"
            @click="closeAddDialog"
          />
        </v-card-title>

        <v-card-text>
          <!-- Loading state -->
          <div v-if="packageStore.isLoading" class="text-center py-8">
            <v-progress-circular indeterminate color="primary" size="48" />
            <p class="text-body-1 mt-4">{{ i18n.t('package-manager-loading-list', 'Loading package list...') }}</p>
            <p class="text-caption text-medium-emphasis">{{ i18n.t('package-manager-loading-hint', 'The first load may take a while') }}</p>
          </div>

          <!-- Error state -->
          <v-alert
            v-if="packageStore.error"
            type="error"
            class="mb-4"
            dismissible
            @click:close="packageStore.clearError"
          >
            {{ packageStore.error }}
          </v-alert>

          <!-- Search and filters -->
          <div v-if="!packageStore.isLoading && packageStore.totalPackages > 0">
            <!-- Package info bar -->
            <v-alert
              variant="tonal"
              color="info"
              class="mb-4"
              :icon="false"
            >
              <div class="d-flex align-center">
                <v-icon icon="mdi-information" size="small" class="mr-2" />
                <span class="text-body-2">
                  {{ translate('package-manager-loaded-count', 'Loaded {count} packages', { count: String(packageStore.totalPackages) }) }}
                </span>
                <v-spacer />
                <v-chip size="small" variant="text" color="info">
                  {{ translate('package-manager-source-count', 'From {count} feeds', { count: String(packageStore.packageSources.length) }) }}
                </v-chip>
              </div>
            </v-alert>

            <!-- Search and filters with responsive layout -->
            <v-row class="mb-4">
              <!-- Search field - full width on mobile, main width on desktop -->
              <v-col cols="12" md="6">
                <v-text-field
                  v-model="searchInput"
                  :label="i18n.t('package-manager-search-label', 'Search packages')"
                  :placeholder="i18n.t('package-manager-search-placeholder', 'Enter package name or description...')"
                  prepend-inner-icon="mdi-magnify"
                  variant="outlined"
                  density="compact"
                  clearable
                />
              </v-col>
              
              <!-- Filters - half width each on mobile, smaller on desktop -->
              <v-col cols="6" md="3">
                <v-select
                  v-model="packageStore.selectedSection"
                  :items="[{ title: i18n.t('package-manager-all-sections', 'All sections'), value: '' }, ...packageStore.packageSections.map(s => ({ title: getSectionName(s), value: s }))]"
                  :label="i18n.t('package-manager-section-label', 'Section')"
                  variant="outlined"
                  density="compact"
                />
              </v-col>
              
              <v-col cols="6" md="3">
                <v-select
                  v-model="packageStore.selectedSource"
                  :items="[{ title: i18n.t('package-manager-all-sources', 'All sources'), value: '' }, ...packageStore.packageSources.map(s => ({ title: getFeedName(s), value: s }))]"
                  :label="i18n.t('package-manager-source-label', 'Feed')"
                  variant="outlined"
                  density="compact"
                />
              </v-col>
            </v-row>

            <!-- Results info -->
            <div class="d-flex align-center mb-3">
              <span class="text-body-2 text-medium-emphasis">
                {{ translate('package-manager-results-info', 'Showing the first 50 results, found {count} packages', { count: String(packageStore.filteredPackages.length) }) }}
              </span>
              <v-spacer />
              <v-btn
                size="small"
                variant="outlined"
                @click="packageStore.clearFilters"
                v-if="searchInput || packageStore.selectedSection || packageStore.selectedSource"
              >
                {{ i18n.t('package-manager-clear-filters', 'Clear Filters') }}
              </v-btn>
            </div>

            <!-- Package list -->
            <v-list lines="three" max-height="400" style="overflow-y: auto">
              <v-list-item
                v-for="pkg in displayPackages"
                :key="pkg.name"
                :class="getPackageBackgroundClass(pkg.name)"
              >
                <template #prepend>
                  <v-icon 
                    :icon="getPackageIcon(pkg.name)"
                    :color="getPackageColor(pkg.name)"
                  />
                </template>

                <v-list-item-title class="font-weight-medium">
                  {{ pkg.name }}
                  <v-chip v-if="packageStore.isPackageInDefaults(pkg.name)" size="x-small" color="secondary" variant="tonal" class="ml-2">
                    {{ i18n.t('package-manager-default-tag', 'Default') }}
                  </v-chip>
                </v-list-item-title>
                <v-list-item-subtitle>
                  <div>{{ pkg.description }}</div>
                  <div class="d-flex align-center mt-1">
                    <v-chip size="x-small" color="secondary" variant="tonal" class="mr-1">
                      {{ getSectionName(pkg.section) }}
                    </v-chip>
                    <v-chip size="x-small" color="info" variant="tonal" class="mr-1">
                      {{ getFeedName(pkg.source || '') }}
                    </v-chip>
                    <span class="text-caption text-medium-emphasis">
                      {{ formatSize(pkg.size) }}
                    </span>
                  </div>
                </v-list-item-subtitle>

                <template #append>
                  <div class="d-flex align-center">
                    <v-btn
                      icon="mdi-information-outline"
                      variant="text"
                      size="small"
                      @click="showPackageDetails(pkg)"
                    />
                    
                    <!-- Logic for non-default package buttons -->
                    <template v-if="!packageStore.isPackageInDefaults(pkg.name)">
                      <v-btn
                        v-if="!packageStore.isPackageSelected(pkg.name)"
                        icon="mdi-plus"
                        variant="text"
                        size="small"
                        color="primary"
                        :title="i18n.t('package-manager-action-add', 'Add')"
                        @click="packageStore.togglePackage(pkg.name)"
                      />
                      <v-btn
                        v-else
                        icon="mdi-close"
                        variant="text"
                        size="small"
                        color="error"
                        :title="i18n.t('package-manager-action-remove', 'Remove')"
                        @click="packageStore.togglePackage(pkg.name)"
                      />
                    </template>
                    
                    <!-- Logic for default package buttons -->
                    <template v-else>
                      <v-btn
                        v-if="packageStore.isPackageSelected(pkg.name)"
                        icon="mdi-delete"
                        variant="text"
                        size="small"
                        color="error"
                        :title="i18n.t('package-manager-action-exclude', 'Exclude')"
                        @click="packageStore.togglePackage(pkg.name)"
                      />
                      <v-btn
                        v-else
                        icon="mdi-restore"
                        variant="text"
                        size="small"
                        color="success"
                        :title="i18n.t('package-manager-action-undo-exclude', 'Undo exclude')"
                        @click="packageStore.togglePackage(pkg.name)"
                      />
                    </template>
                  </div>
                </template>
              </v-list-item>
            </v-list>
          </div>
        </v-card-text>

      </v-card>
    </v-dialog>

    <!-- Bulk Add Dialog -->
    <v-dialog v-model="showBulkAddDialog" max-width="1000px" scrollable>
      <v-card>
        <v-card-title class="d-flex align-center">
          <v-icon icon="mdi-playlist-plus" class="mr-2" />
          {{ i18n.t('package-manager-bulk-title', 'Batch Add Packages') }}
          <v-spacer />
          <v-btn
            icon="mdi-close"
            variant="text"
            size="small"
            @click="closeBulkAddDialog"
          />
        </v-card-title>

        <v-card-text>
          <v-alert
            variant="tonal"
            color="info"
            class="mb-4"
            :icon="false"
          >
            <div class="d-flex align-center">
              <v-icon icon="mdi-information-outline" size="small" class="mr-2" />
              <span class="text-body-2">
                {{ i18n.t('package-manager-bulk-hint', 'Enter package names separated by spaces to add them all at once') }}
              </span>
            </div>
          </v-alert>

          <v-textarea
            v-model="bulkInput"
            :label="i18n.t('package-manager-bulk-input-label', 'Package names')"
            :placeholder="i18n.t('package-manager-bulk-input-placeholder', 'e.g. luci nano openssh-sftp-server')"
            auto-grow
            rows="3"
            variant="outlined"
            clearable
            class="mb-4"
          />

          <v-alert
            v-if="bulkValidationError"
            type="error"
            class="mb-4"
          >
            {{ bulkValidationError }}
          </v-alert>

          <div v-if="bulkValidationResult">
            <div class="d-flex align-center mb-3">
              <v-chip
                color="primary"
                variant="tonal"
                size="small"
                class="mr-2"
              >
                {{ translate('package-manager-bulk-found-count', 'Existing: {count}', { count: String(bulkValidationResult.found.length) }) }}
              </v-chip>
              <v-chip
                v-if="bulkValidationResult.missing.length"
                color="error"
                variant="tonal"
                size="small"
              >
                {{ translate('package-manager-bulk-missing-count', 'Missing: {count}', { count: String(bulkValidationResult.missing.length) }) }}
              </v-chip>
            </div>

            <v-alert
              v-if="bulkValidationResult.found.length"
              type="success"
              class="mb-4"
              :title="i18n.t('package-manager-bulk-found-title', 'Available packages')"
            >
              {{ bulkValidationResult.found.join(', ') }}
            </v-alert>

          <v-alert
            v-if="bulkValidationResult.missing.length"
            type="warning"
            class="mb-4"
            :title="i18n.t('package-manager-bulk-missing-title', 'Unavailable packages')"
          >
            {{ bulkValidationResult.missing.join(', ') }}
            <div
              v-if="bulkRequiresConfirmation"
              class="mt-2 text-body-2"
            >
              {{ i18n.t('package-manager-bulk-missing-notice', 'Click "Add" again to continue. Missing packages will be ignored.') }}
            </div>
          </v-alert>
        </div>
      </v-card-text>

      <v-card-actions class="justify-end">
        <v-btn variant="text" @click="closeBulkAddDialog">
          {{ i18n.t('common-cancel', 'Cancel') }}
        </v-btn>
        <v-btn
          color="primary"
          @click="submitBulkAdd"
          :disabled="!bulkInput.trim()"
        >
          {{ i18n.t('package-manager-bulk-add', 'Add') }}
        </v-btn>
      </v-card-actions>
    </v-card>
  </v-dialog>

    <!-- Package Detail Dialog -->
    <PackageDetailDialog 
      v-model="showPackageDetail"
      :package-detail="selectedPackageDetail"
    />
  </v-card>
</template>

<style scoped>
.package-manager-title {
  gap: 8px;
}

.package-manager-actions {
  margin-left: auto;
  display: flex;
  flex-wrap: wrap;
  justify-content: flex-end;
  align-items: center;
  gap: 8px;
}

.package-manager-actions .package-action-btn {
  flex: 0 0 auto;
  min-width: 0;
  min-height: 44px;
}

@media (max-width: 600px) {
  .package-manager-actions {
    width: 100%;
    margin-left: 0;
    margin-top: 8px;
    justify-content: flex-start;
    flex-direction: column;
    align-items: stretch;
  }

  .package-manager-actions .package-action-btn {
    flex: 1 1 100%;
  }
}

.bg-primary-container {
  background-color: rgba(var(--v-theme-primary), 0.1);
}
</style>
