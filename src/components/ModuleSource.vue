<script setup lang="ts">
import { ref, computed } from 'vue'
import { useModuleStore } from '@/stores/module'
import { useI18nStore } from '@/stores/i18n'

const moduleStore = useModuleStore()
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

// Add source dialog
const showAddDialog = ref(false)
const newSourceUrl = ref('')
const newSourceName = ref('')
const newSourceRef = ref('main')

// Form validation
const urlRules = [
  (v: string) => !!v || i18n.t('module-source-url-required', 'URL is required'),
  (v: string) => {
    const githubPattern = /^https?:\/\/github\.com\/[^\/]+\/[^\/]+/
    return githubPattern.test(v) || i18n.t('module-source-url-invalid', 'Must be a valid GitHub repository URL')
  }
]

const nameRules = [
  (v: string) => !!v || i18n.t('module-source-name-required', 'Name is required')
]

const refRules = [
  (v: string) => !!v || i18n.t('module-source-ref-required', 'Reference is required')
]

// Form state
const isFormValid = computed(() => {
  return newSourceUrl.value && 
         newSourceName.value && 
         newSourceRef.value &&
         urlRules.every(rule => rule(newSourceUrl.value) === true) &&
         nameRules.every(rule => rule(newSourceName.value) === true) &&
         refRules.every(rule => rule(newSourceRef.value) === true)
})

async function addSource() {
  if (!isFormValid.value) return
  
  try {
    await moduleStore.addModuleSource(newSourceUrl.value, newSourceName.value, newSourceRef.value)
    showAddDialog.value = false
    resetForm()
  } catch (error) {
    // Error is handled by the store
  }
}

function resetForm() {
  newSourceUrl.value = ''
  newSourceName.value = ''
  newSourceRef.value = 'main'
}

function closeAddDialog() {
  showAddDialog.value = false
  resetForm()
  moduleStore.clearError()
}

async function refreshSource(sourceId: string) {
  try {
    await moduleStore.refreshModuleSource(sourceId)
  } catch (error) {
    // Error is handled by the store
  }
}

function removeSource(sourceId: string) {
  moduleStore.removeModuleSource(sourceId)
}

function formatDate(date: Date | undefined): string {
  if (!date) return i18n.t('module-source-never', 'Never')
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
  <v-card>
    <v-card-title class="d-flex align-center">
      <v-icon icon="mdi-source-repository" class="mr-2" />
      {{ i18n.t('module-source-title', 'Module Source Manager') }}
      <v-spacer />
      <v-btn
        color="primary"
        prepend-icon="mdi-plus"
        @click="showAddDialog = true"
      >
        {{ i18n.t('module-source-add', 'Add Module Source') }}
      </v-btn>
    </v-card-title>

    <v-card-text>
      <!-- Error Alert -->
      <v-alert
        v-if="moduleStore.error"
        type="error"
        dismissible
        @click:close="moduleStore.clearError"
        class="mb-4"
      >
        {{ moduleStore.error }}
      </v-alert>

      <!-- Module Sources List -->
      <div v-if="moduleStore.sources.length === 0" class="text-center py-8">
        <v-icon icon="mdi-source-repository-multiple" size="64" color="grey-lighten-1" />
        <p class="text-h6 mt-4 text-grey">{{ i18n.t('module-source-empty', 'No module sources added yet') }}</p>
        <p class="text-grey">{{ i18n.t('module-source-empty-hint', 'Click "Add Module Source" to get started') }}</p>
      </div>

      <v-row v-else>
        <v-col
          v-for="source in moduleStore.sources"
          :key="source.id"
          cols="12"
          md="6"
        >
          <v-card variant="outlined">
            <v-card-title class="d-flex align-center">
              <v-icon icon="mdi-github" class="mr-2" />
              {{ source.name }}
              <v-spacer />
              <v-menu>
                <template #activator="{ props }">
                  <v-btn
                    icon="mdi-dots-vertical"
                    variant="text"
                    size="small"
                    v-bind="props"
                  />
                </template>
                <v-list>
                  <v-list-item @click="refreshSource(source.id)">
                    <template #prepend>
                      <v-icon icon="mdi-refresh" />
                    </template>
                    <v-list-item-title>{{ i18n.t('common-refresh', 'Refresh') }}</v-list-item-title>
                  </v-list-item>
                  <v-list-item @click="removeSource(source.id)" class="text-error">
                    <template #prepend>
                      <v-icon icon="mdi-delete" />
                    </template>
                    <v-list-item-title>{{ i18n.t('common-delete', 'Delete') }}</v-list-item-title>
                  </v-list-item>
                </v-list>
              </v-menu>
            </v-card-title>

            <v-card-text>
              <div class="text-body-2 mb-2">
                <strong>{{ i18n.t('module-source-repo-label', 'Repository') }}:</strong> {{ source.url }}
              </div>
              <div class="text-body-2 mb-2">
                <strong>{{ i18n.t('module-source-ref-label', 'Reference') }}:</strong> {{ source.ref }}
              </div>
              <div class="text-body-2 mb-2">
                <strong>{{ i18n.t('module-source-count-label', 'Modules') }}:</strong> {{ source.modules.length }}
              </div>
              <div class="text-body-2">
                <strong>{{ i18n.t('module-source-updated-label', 'Last Updated') }}:</strong> {{ formatDate(source.lastUpdated) }}
              </div>
            </v-card-text>

            <v-card-actions>
              <v-chip-group>
                <v-chip
                  v-for="module in source.modules.slice(0, 3)"
                  :key="module.id"
                  size="small"
                  variant="outlined"
                >
                  {{ module.definition.name }}
                </v-chip>
                <v-chip
                  v-if="source.modules.length > 3"
                  size="small"
                  variant="outlined"
                >
                  {{ translate('module-source-more', '+{count} more', { count: String(source.modules.length - 3) }) }}
                </v-chip>
              </v-chip-group>
            </v-card-actions>
          </v-card>
        </v-col>
      </v-row>
    </v-card-text>

    <!-- Add Source Dialog -->
    <v-dialog v-model="showAddDialog" max-width="600px">
      <v-card>
        <v-card-title>{{ i18n.t('module-source-add', 'Add Module Source') }}</v-card-title>
        
        <v-card-text>
          <v-form>
            <v-text-field
              v-model="newSourceUrl"
              :label="i18n.t('module-source-url-label', 'GitHub repository URL')"
              placeholder="https://github.com/username/repository"
              :rules="urlRules"
              required
              prepend-icon="mdi-github"
            />
            
            <v-text-field
              v-model="newSourceName"
              :label="i18n.t('module-source-name-label', 'Source name')"
              :placeholder="i18n.t('module-source-name-placeholder', 'My Module Source')"
              :rules="nameRules"
              required
              prepend-icon="mdi-tag"
            />
            
            <v-text-field
              v-model="newSourceRef"
              :label="i18n.t('module-source-ref-input-label', 'Branch/Tag/Commit')"
              placeholder="main, v1.0.0, commit-sha"
              :rules="refRules"
              required
              prepend-icon="mdi-source-branch"
            />

            <v-alert type="info" variant="tonal" class="mt-4">
              <div class="text-body-2">
                <p><strong>{{ i18n.t('module-source-ref-info-title', 'Supported reference formats:') }}</strong></p>
                <ul>
                  <li>{{ i18n.t('module-source-ref-branch', 'Branch: main, develop, feature/xxx') }}</li>
                  <li>{{ i18n.t('module-source-ref-tag', 'Tag: v1.0.0, release-2024.1') }}</li>
                  <li>{{ i18n.t('module-source-ref-commit', 'Commit: commit SHA') }}</li>
                </ul>
                <p class="mt-2">{{ i18n.t('module-source-ref-note', 'Keep the reference as provided. The backend resolves it during build.') }}</p>
              </div>
            </v-alert>
          </v-form>
        </v-card-text>

        <v-card-actions>
          <v-spacer />
          <v-btn @click="closeAddDialog">{{ i18n.t('common-cancel', 'Cancel') }}</v-btn>
          <v-btn
            color="primary"
            :disabled="!isFormValid || moduleStore.isLoading"
            :loading="moduleStore.isLoading"
            @click="addSource"
          >
            {{ i18n.t('common-add', 'Add') }}
          </v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>
  </v-card>
</template>
