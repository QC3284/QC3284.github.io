import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { usePackageStore } from './package'
import type { OpenWrtPackage } from '@/types/package'

export interface CustomRepository {
  name: string
  url: string
  loading?: boolean
  packages?: OpenWrtPackage[]
  error?: string
}

export interface CustomBuildSnapshot {
  packageConfiguration: {
    addedPackages: string[]
    removedPackages: string[]
  }
  uciDefaults?: string
  rootfsSizeMb?: number
  repositories: CustomRepository[]
  repositoryKeys: string[]
}

function createEmptySnapshot(): CustomBuildSnapshot {
  return {
    packageConfiguration: { addedPackages: [], removedPackages: [] },
    repositories: [],
    repositoryKeys: []
  }
}

export const useCustomBuildStore = defineStore('customBuild', () => {
  const packageStore = usePackageStore()

  const uciDefaults = ref('')
  const rootfsSizeMb = ref<number | null>(null)
  const repositories = ref<CustomRepository[]>([])
  const repositoryKeys = ref<string[]>([])
  function setUciDefaults(value: string) {
    uciDefaults.value = value
  }

  function setRootfsSize(value: number | null) {
    rootfsSizeMb.value = value
  }

  function setRepositories(items: CustomRepository[]) {
    repositories.value = items.map(item => ({ ...item }))
  }

  function setRepositoryKeys(keys: string[]) {
    repositoryKeys.value = [...keys]
  }

  function addRepository() {
    repositories.value.push({ name: '', url: '' })
  }

  function updateRepository(index: number, payload: Partial<CustomRepository>) {
    const repo = repositories.value[index]
    if (!repo) return
    repositories.value[index] = { ...repo, ...payload }
  }

  function removeRepository(index: number) {
    repositories.value.splice(index, 1)
  }

  function addRepositoryKey() {
    repositoryKeys.value.push('')
  }

  function updateRepositoryKey(index: number, value: string) {
    repositoryKeys.value[index] = value
  }

  function removeRepositoryKey(index: number) {
    repositoryKeys.value.splice(index, 1)
  }

  function reset() {
    uciDefaults.value = ''
    rootfsSizeMb.value = null
    repositories.value = []
    repositoryKeys.value = []
    packageStore.clearAllPackages()
  }

  function getSnapshot(): CustomBuildSnapshot {
    const packageConfiguration = packageStore.getPackageConfiguration()

    return {
      packageConfiguration,
      uciDefaults: uciDefaults.value.trim() ? uciDefaults.value : undefined,
      rootfsSizeMb: rootfsSizeMb.value ?? undefined,
      repositories: repositories.value
        .filter(repo => repo.name.trim() && repo.url.trim())
        .map(repo => ({ name: repo.name.trim(), url: repo.url.trim() })),
      repositoryKeys: repositoryKeys.value
        .map(key => key.trim())
        .filter(key => key.length > 0)
    }
  }

  function applySnapshot(snapshot?: Partial<CustomBuildSnapshot>) {
    const pkgConfig = snapshot?.packageConfiguration
    const normalized: CustomBuildSnapshot = {
      packageConfiguration: {
        addedPackages: Array.isArray(pkgConfig?.addedPackages)
          ? [...pkgConfig.addedPackages]
          : [],
        removedPackages: Array.isArray(pkgConfig?.removedPackages)
          ? [...pkgConfig.removedPackages]
          : []
      },
      uciDefaults: typeof snapshot?.uciDefaults === 'string' ? snapshot.uciDefaults : undefined,
      rootfsSizeMb: typeof snapshot?.rootfsSizeMb === 'number' ? snapshot.rootfsSizeMb : undefined,
      repositories: Array.isArray(snapshot?.repositories)
        ? snapshot.repositories.map(repo => ({ ...repo }))
        : [],
      repositoryKeys: Array.isArray(snapshot?.repositoryKeys)
        ? snapshot.repositoryKeys.map(key => key)
        : []
    }

    packageStore.setPackageConfiguration(normalized.packageConfiguration)
    uciDefaults.value = normalized.uciDefaults ?? ''
    rootfsSizeMb.value = normalized.rootfsSizeMb ?? null
    repositories.value = normalized.repositories.map(repo => ({ ...repo }))
    repositoryKeys.value = [...normalized.repositoryKeys]
  }

  const hasCustomData = computed(() => {
    const snapshot = getSnapshot()
    return Boolean(
      snapshot.uciDefaults && snapshot.uciDefaults.length > 0 ||
      snapshot.rootfsSizeMb !== undefined ||
      snapshot.repositories.length > 0 ||
      snapshot.repositoryKeys.length > 0 ||
      snapshot.packageConfiguration.addedPackages.length > 0 ||
      snapshot.packageConfiguration.removedPackages.length > 0
    )
  })

  return {
    uciDefaults,
    rootfsSizeMb,
    repositories,
    repositoryKeys,
    hasCustomData,
    setUciDefaults,
    setRootfsSize,
    setRepositories,
    setRepositoryKeys,
    addRepository,
    updateRepository,
    removeRepository,
    addRepositoryKey,
    updateRepositoryKey,
    removeRepositoryKey,
    reset,
    getSnapshot,
    applySnapshot
  }
})
