<script setup lang="ts">
import { computed } from 'vue'
import { useI18nStore } from '@/stores/i18n'
import { useFirmwareStore } from '@/stores/firmware'
import { config } from '@/config'
import type { DeviceImage } from '@/services/api'
import type { AsuBuildResponse } from '@/services/asu'

// Props
const props = defineProps<{
  buildResult?: (AsuBuildResponse & { asu_image_url: string }) | null
}>()

const i18n = useI18nStore()
const firmware = useFirmwareStore()

interface ProcessedImage extends DeviceImage {
  downloadUrl: string
  helpClass: string
  label: string
  priority: number
}

const processedImages = computed(() => {
  // If we have ASU build result, use that instead
  if (props.buildResult?.images) {
    const images = props.buildResult.images.map(image => {
      const processed: ProcessedImage = {
        ...image,
        downloadUrl: `${props.buildResult!.asu_image_url}/${image.name}`,
        helpClass: getHelpTextClass(image),
        label: getImageLabel(image),
        priority: getImagePriority(image.type)
      }
      return processed
    })

    return images.sort((a, b) => a.priority - b.priority)
  }

  // Otherwise use normal firmware images
  if (!firmware.selectedProfile?.images) return []

  const images = firmware.selectedProfile.images.map(image => {
    const processed: ProcessedImage = {
      ...image,
      downloadUrl: firmware.getDownloadUrl(image),
      helpClass: getHelpTextClass(image),
      label: getImageLabel(image),
      priority: getImagePriority(image.type)
    }
    return processed
  })

  // Sort by priority (sysupgrade first, then factory, then others)
  return images.sort((a, b) => a.priority - b.priority)
})

function getImagePriority(type: string): number {
  if (type.includes('sysupgrade')) return 0
  if (type.includes('factory')) return 1
  return 2
}

function getImageLabel(image: DeviceImage): string {
  let label = image.type.toUpperCase()

  // Add differentiating info if multiple images of same type
  const sameTypeImages = firmware.selectedProfile?.images.filter(img => img.type === image.type) || []
  if (sameTypeImages.length > 1) {
    const extra = getNameDifference(firmware.selectedProfile?.images || [], image)
    if (extra) {
      label += ` (${extra})`
    }
  }

  return label
}

function getNameDifference(images: DeviceImage[], targetImage: DeviceImage): string {
  const sameTypeImages = images.filter(img => img.type === targetImage.type)
  if (sameTypeImages.length <= 1) return ''

  const nameParts = targetImage.name.split('-')
  const otherNameParts = sameTypeImages
    .filter(img => img.name !== targetImage.name)
    .map(img => img.name.split('-'))

  // Find unique parts
  const uniqueParts = nameParts.filter(part =>
    !otherNameParts.every(otherParts => otherParts.includes(part))
  )

  return uniqueParts.join('-')
}

function getHelpTextClass(image: DeviceImage): string {
  const type = image.type
  const name = image.name

  if (type.includes('sysupgrade')) {
    return 'tr-sysupgrade-help'
  } else if (type.includes('factory') || type === 'trx' || type === 'chk') {
    return 'tr-factory-help'
  } else if (name.includes('initramfs')) {
    return 'tr-initramfs-help'
  } else if (type.includes('kernel') || type.includes('zimage') || type.includes('uimage')) {
    return 'tr-kernel-help'
  } else if (type.includes('root')) {
    return 'tr-rootfs-help'
  } else if (type.includes('sdcard')) {
    return 'tr-sdcard-help'
  } else if (type.includes('tftp')) {
    return 'tr-tftp-help'
  } else if (type.includes('.dtb')) {
    return 'tr-dtb-help'
  } else if (type.includes('cpximg')) {
    return 'tr-cpximg-help'
  } else if (type.startsWith('eva')) {
    return 'tr-eva-help'
  } else if (type.includes('uboot') || type.includes('u-boot')) {
    return 'tr-uboot-help'
  } else {
    return 'tr-other-help'
  }
}

function getHelpText(helpClass: string): string {
  const helpTexts: Record<string, string> = {
    'tr-sysupgrade-help': i18n.t('tr-sysupgrade-help', 'Use a Sysupgrade image to update a router that already runs OpenWrt. The image can be used with the LuCI web interface or the terminal.').replace('OpenWrt', config.brand_name),
    'tr-factory-help': i18n.t('tr-factory-help', 'Use a Factory image to flash a router with OpenWrt for the first time. You normally do this via the web interface of the original firmware.').replace('OpenWrt', config.brand_name),
    'tr-initramfs-help': i18n.t('tr-initramfs-help', 'Linux kernel with minimal file system. Useful for first installation or recovery.'),
    'tr-kernel-help': i18n.t('tr-kernel-help', 'Linux kernel as a separate image.'),
    'tr-rootfs-help': i18n.t('tr-rootfs-help', 'Root file system as a separate image.'),
    'tr-sdcard-help': i18n.t('tr-sdcard-help', 'Image that is meant to be flashed onto a SD-Card.'),
    'tr-tftp-help': i18n.t('tr-tftp-help', 'TFTP images are used to flash a device via the TFTP method of the bootloader.'),
    'tr-dtb-help': i18n.t('tr-dtb-help', 'Device tree blob. This file configures the Linux Kernel for the hardware.'),
    'tr-cpximg-help': i18n.t('tr-cpximg-help', 'Use with sysupgrade in the stock firmware or with the built-in cpximg loader.'),
    'tr-eva-help': i18n.t('tr-eva-help', 'Image with OpenWrt and a boot loader.'),
    'tr-uboot-help': i18n.t('tr-uboot-help', 'Bootloader image. Low-level software which loads the operating system early on boot.'),
    'tr-other-help': i18n.t('tr-other-help', 'Other image type.')
  }

  return helpTexts[helpClass] || ''
}

function getImageIcon(type: string): string {
  if (type.includes('sysupgrade')) return 'mdi-update'
  if (type.includes('factory')) return 'mdi-factory'
  if (type.includes('kernel')) return 'mdi-memory'
  if (type.includes('root')) return 'mdi-harddisk'
  if (type.includes('sdcard')) return 'mdi-sd'
  return 'mdi-download'
}

</script>

<template>
  <v-card>
    <v-card-title class="bg-secondary text-white">
      {{ props.buildResult ? i18n.t('tr-custom-downloads', 'Custom Downloads') : i18n.t('tr-downloads', 'Download an image') }}
    </v-card-title>

    <v-card-text class="pa-0">
      <v-list>
        <v-list-item
          v-for="(image, index) in processedImages"
          :key="image.name"
          class="py-4"
          :class="{ 'border-b': index < processedImages.length - 1 }"
          lines="three"
        >
          <template #prepend>
            <v-avatar color="primary" variant="tonal">
              <v-icon :icon="getImageIcon(image.type)" />
            </v-avatar>
          </template>

          <v-list-item-title class="d-flex align-center">
            <v-btn
              :href="image.downloadUrl"
              color="primary"
              variant="elevated"
              class="mr-4 download-btn"
              prepend-icon="mdi-download"
            >
              {{ image.label }}
            </v-btn>
          </v-list-item-title>

          <v-list-item-subtitle class="mt-2">
            <div class="text-body-2 mb-2">
              {{ getHelpText(image.helpClass) }}
            </div>
          </v-list-item-subtitle>

          <div class="sha256-hash" v-if="image.sha256">
            <strong>sha256sum:</strong> {{ image.sha256 }}
          </div>
        </v-list-item>
      </v-list>
    </v-card-text>
  </v-card>
</template>

<style scoped>
.border-b {
  border-bottom: 1px solid rgb(var(--v-border-color));
}

.font-mono {
  font-family: 'Monaco', 'Menlo', 'Ubuntu Mono', monospace;
  font-size: 0.75rem;
  word-break: break-all;
}

.sha256-hash {
  font-family: 'Monaco', 'Menlo', 'Ubuntu Mono', monospace;
  font-size: 0.75rem;
  color: #666;
  margin-top: 8px;
  word-break: break-all;
}

.download-btn {
  height: auto !important;
  min-height: 48px !important;
  padding: 12px 16px !important;
}

.download-btn :deep(.v-btn__content) {
  white-space: pre-wrap !important;
  word-break: break-word !important;
  line-height: 1.3 !important;
  text-align: left !important;
  width: 100% !important;
  justify-content: flex-start !important;
}

.download-btn :deep(.v-btn__prepend) {
  align-self: flex-start !important;
  margin-top: 2px !important;
  margin-right: 8px !important;
}
</style>
