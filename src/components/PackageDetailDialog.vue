<script setup lang="ts">
import { ref, defineAsyncComponent } from 'vue'
import { packageManager } from '@/services/packageManager'
import { usePackageStore } from '@/stores/package'
import type { OpenWrtPackage } from '@/types/package'
import { useI18nStore } from '@/stores/i18n'

const packageStore = usePackageStore()
const i18n = useI18nStore()

// Async component to avoid circular dependency
const AsyncPackageDetailDialog = defineAsyncComponent(() => import('./PackageDetailDialog.vue'))

// Props
defineProps<{
  modelValue: boolean
  packageDetail: OpenWrtPackage | null
}>()

// Emits
const emit = defineEmits<{
  'update:modelValue': [value: boolean]
  'show-dependency': [packageName: string]
}>()

// State for nested dependency dialog
const showDependencyDetail = ref(false)
const selectedDependencyDetail = ref<OpenWrtPackage | null>(null)

function closeDialog() {
  emit('update:modelValue', false)
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

function showDependencyDetails(dependencyName: string) {
  const packageInfo = packageStore.getPackageInfo(dependencyName)
  if (packageInfo) {
    selectedDependencyDetail.value = packageInfo
    showDependencyDetail.value = true
  }
}

function closeDependencyDetail() {
  showDependencyDetail.value = false
  selectedDependencyDetail.value = null
}
</script>

<template>
  <v-dialog :model-value="modelValue" @update:model-value="emit('update:modelValue', $event)" max-width="600px" scrollable>
    <v-card v-if="packageDetail">
      <v-card-title class="d-flex align-center">
        <v-icon icon="mdi-package-variant" class="mr-2" />
        {{ packageDetail.name }}
        <v-spacer />
        <v-btn
          icon="mdi-close"
          variant="text"
          size="small"
          @click="closeDialog"
        />
      </v-card-title>

      <v-card-text>
        <div class="mb-4">
          <h4 class="text-subtitle-1 mb-2">{{ i18n.t('package-detail-description', 'Description') }}</h4>
          <p class="text-body-2">{{ packageDetail.description }}</p>
        </div>

        <!-- First row: version + license -->
        <v-row>
          <v-col cols="6">
            <div class="mb-3">
              <h4 class="text-subtitle-2 mb-1">{{ i18n.t('package-detail-version', 'Version') }}</h4>
              <v-chip size="small" color="primary" variant="tonal">
                v{{ packageDetail.version }}
              </v-chip>
            </div>
          </v-col>
          <v-col cols="6">
            <div class="mb-3">
              <h4 class="text-subtitle-2 mb-1">{{ i18n.t('package-detail-license', 'License') }}</h4>
              <span class="text-body-2">{{ packageDetail.license || i18n.t('package-detail-unknown', 'Unknown') }}</span>
            </div>
          </v-col>
        </v-row>

        <!-- Second row: section + source -->
        <v-row>
          <v-col cols="6">
            <div class="mb-3">
              <h4 class="text-subtitle-2 mb-1">{{ i18n.t('package-detail-section', 'Section') }}</h4>
              <v-chip size="small" color="secondary" variant="tonal">
                {{ getSectionName(packageDetail.section) }}
              </v-chip>
            </div>
          </v-col>
          <v-col cols="6">
            <div class="mb-3">
              <h4 class="text-subtitle-2 mb-1">{{ i18n.t('package-detail-source', 'Source') }}</h4>
              <v-chip size="small" color="info" variant="tonal">
                {{ getFeedName(packageDetail.source || '') }}
              </v-chip>
            </div>
          </v-col>
        </v-row>

        <!-- Third row: download size + install size -->
        <v-row>
          <v-col cols="6">
            <div class="mb-3">
              <h4 class="text-subtitle-2 mb-1">{{ i18n.t('package-detail-download-size', 'Download Size') }}</h4>
              <span class="text-body-2">{{ formatSize(packageDetail.size) }}</span>
            </div>
          </v-col>
          <v-col cols="6">
            <div class="mb-3">
              <h4 class="text-subtitle-2 mb-1">{{ i18n.t('package-detail-install-size', 'Install Size') }}</h4>
              <span class="text-body-2">{{ formatSize(packageDetail.installedSize || 0) }}</span>
            </div>
          </v-col>
        </v-row>

        <!-- Homepage link -->
        <div v-if="packageDetail.url" class="mb-3">
          <h4 class="text-subtitle-2 mb-1">{{ i18n.t('package-detail-homepage', 'Homepage') }}</h4>
          <a :href="packageDetail.url" target="_blank" class="text-primary">
            {{ packageDetail.url }}
          </a>
        </div>

        <!-- Last section: dependencies -->
        <div v-if="packageDetail.depends?.length" class="mb-3">
          <h4 class="text-subtitle-2 mb-2">{{ i18n.t('package-detail-dependencies', 'Dependencies') }}</h4>
          <div class="d-flex flex-wrap">
            <v-chip
              v-for="dep in packageDetail.depends"
              :key="dep"
              size="x-small"
              variant="outlined"
              class="ma-1"
              :color="packageStore.getPackageInfo(dep) ? 'primary' : 'default'"
              :style="packageStore.getPackageInfo(dep) ? 'cursor: pointer' : ''"
              @click="packageStore.getPackageInfo(dep) ? showDependencyDetails(dep) : null"
            >
              <v-icon 
                v-if="packageStore.getPackageInfo(dep)" 
                size="x-small" 
                class="mr-1"
              >
                mdi-information-outline
              </v-icon>
              {{ dep }}
            </v-chip>
          </div>
        </div>
      </v-card-text>

    </v-card>
  </v-dialog>

  <!-- Nested Dependency Detail Dialog -->
  <AsyncPackageDetailDialog 
    v-if="showDependencyDetail"
    v-model="showDependencyDetail"
    :package-detail="selectedDependencyDetail"
  />
</template>
