// Module parameter validation service

import type { ModuleParameter } from '@/types/module'
import { useI18nStore } from '@/stores/i18n'

export interface ValidationResult {
  isValid: boolean
  errorMessage?: string
}

export interface ParameterValidationRules {
  required: boolean
  pattern?: string
  minLength?: number
  maxLength?: number
  type?: 'string' | 'number' | 'email' | 'url' | 'ip' | 'mac' | 'hostname'
  customMessage?: string
}

function translate(key: string, fallback: string, replacements?: Record<string, string>): string {
  try {
    const store = useI18nStore()
    let text = store?.t(key, fallback) ?? fallback
    if (replacements) {
      for (const [token, value] of Object.entries(replacements)) {
        text = text.replace(new RegExp(`{${token}}`, 'g'), value)
      }
    }
    return text
  } catch {
    return fallback
  }
}

export class ModuleValidationService {
  /**
   * Validate a single parameter value
   */
  validateParameter(param: ModuleParameter, value: string): ValidationResult {
    // Check required
    if (param.required && (!value || value.trim() === '')) {
      return {
        isValid: false,
        errorMessage: translate('module-validation-required', '{name} is required', {
          name: param.name
        })
      }
    }

    // Skip validation for empty optional parameters
    if (!param.required && (!value || value.trim() === '')) {
      return { isValid: true }
    }

    // Pattern validation
    if (param.validation?.pattern) {
      const patternResult = this.validatePattern(param.validation.pattern, value)
      if (!patternResult.isValid) {
        return {
          isValid: false,
          errorMessage: translate('module-validation-invalid-format', '{name} is invalid: {message}', {
            name: param.name,
            message: patternResult.errorMessage ?? ''
          })
        }
      }
    }

    return { isValid: true }
  }

  /**
   * Validate parameter against regex pattern
   */
  private validatePattern(pattern: string, value: string): ValidationResult {
    try {
      const regex = new RegExp(pattern)
      if (!regex.test(value)) {
        return {
          isValid: false,
          errorMessage: this.getPatternErrorMessage(pattern)
        }
      }
      return { isValid: true }
    } catch (error) {
      console.warn('Invalid regex pattern:', pattern, error)
      return { isValid: true } // Skip validation if pattern is invalid
    }
  }

  /**
   * Get user-friendly error message for common patterns
   */
  private getPatternErrorMessage(pattern: string): string {
    const commonPatterns: Record<string, { key: string, fallback: string }> = {
      // IP address patterns
      '^((25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\\.){3}(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)$': {
        key: 'module-validation-error-ip',
        fallback: 'Please enter a valid IP address'
      },
      '^(?:[0-9]{1,3}\\.){3}[0-9]{1,3}$': {
        key: 'module-validation-error-ip',
        fallback: 'Please enter a valid IP address'
      },
      
      // MAC address patterns
      '^([0-9A-Fa-f]{2}[:-]){5}([0-9A-Fa-f]{2})$': {
        key: 'module-validation-error-mac',
        fallback: 'Please enter a valid MAC address'
      },
      '^[0-9a-fA-F]{2}(:[0-9a-fA-F]{2}){5}$': {
        key: 'module-validation-error-mac',
        fallback: 'Please enter a valid MAC address'
      },
      
      // Email patterns
      '^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$': {
        key: 'module-validation-error-email',
        fallback: 'Please enter a valid email address'
      },
      
      // URL patterns
      '^https?://.*': {
        key: 'module-validation-error-url',
        fallback: 'Please enter a valid URL'
      },
      '^(https?|ftp)://[^\\s/$.?#].[^\\s]*$': {
        key: 'module-validation-error-url',
        fallback: 'Please enter a valid URL'
      },
      
      // Hostname patterns
      '^[a-zA-Z0-9]([a-zA-Z0-9\\-]{0,61}[a-zA-Z0-9])?$': {
        key: 'module-validation-error-hostname',
        fallback: 'Please enter a valid hostname'
      },
      
      // Port patterns
      '^(6553[0-5]|655[0-2][0-9]|65[0-4][0-9]{2}|6[0-4][0-9]{3}|[1-5][0-9]{4}|[1-9][0-9]{0,3})$': {
        key: 'module-validation-error-port',
        fallback: 'Please enter a valid port (1-65535)'
      },
      
      // Number patterns
      '^[0-9]+$': {
        key: 'module-validation-error-number',
        fallback: 'Please enter a number'
      },
      '^[1-9][0-9]*$': {
        key: 'module-validation-error-positive-number',
        fallback: 'Please enter a positive integer'
      },
      
      // Password patterns
      '^(?=.*[a-z])(?=.*[A-Z])(?=.*\\d)[a-zA-Z\\d@$!%*?&]{8,}$': {
        key: 'module-validation-error-password',
        fallback: 'Password must be at least 8 characters with upper, lower case letters and numbers'
      },
      
      // SSID patterns
      '^[\\x20-\\x7E]{1,32}$': {
        key: 'module-validation-error-ssid',
        fallback: 'Please enter a valid SSID (1-32 characters)'
      },
    }

    // Check for exact matches
    for (const [patternKey, message] of Object.entries(commonPatterns)) {
      if (pattern === patternKey) {
        return translate(message.key, message.fallback)
      }
    }

    // Check for partial matches
    if (pattern.includes('IP') || pattern.includes('ip')) {
      return translate('module-validation-error-ip', 'Please enter a valid IP address')
    }
    if (pattern.includes('MAC') || pattern.includes('mac')) {
      return translate('module-validation-error-mac', 'Please enter a valid MAC address')
    }
    if (pattern.includes('@')) {
      return translate('module-validation-error-email', 'Please enter a valid email address')
    }
    if (pattern.includes('http')) {
      return translate('module-validation-error-url', 'Please enter a valid URL')
    }
    if (pattern.includes('[0-9]')) {
      return translate('module-validation-error-number', 'Please enter a number')
    }

    return translate('module-validation-error-generic', 'Input format is invalid')
  }

  /**
   * Validate all parameters for a module selection
   */
  validateAllParameters(
    parameters: { [key: string]: ModuleParameter },
    values: { [key: string]: string }
  ): { isValid: boolean; errors: { [key: string]: string } } {
    const errors: { [key: string]: string } = {}

    for (const [key, param] of Object.entries(parameters)) {
      const value = values[key] || ''
      const result = this.validateParameter(param, value)
      
      if (!result.isValid) {
        errors[key] = result.errorMessage!
      }
    }

    return {
      isValid: Object.keys(errors).length === 0,
      errors
    }
  }

  /**
   * Get Vuetify validation rules for a parameter
   */
  getVuetifyRules(param: ModuleParameter): Array<(value: string) => boolean | string> {
    const rules: Array<(value: string) => boolean | string> = []

    // Required rule
    if (param.required) {
      rules.push((value: string) => {
        if (!value || value.trim() === '') {
          return translate('module-validation-required', '{name} is required', {
            name: param.name
          })
        }
        return true
      })
    }

    // Pattern rule
    if (param.validation?.pattern) {
      rules.push((value: string) => {
        // Skip validation for empty optional parameters
        if (!param.required && (!value || value.trim() === '')) {
          return true
        }
        
        const result = this.validateParameter(param, value)
        return result.isValid || result.errorMessage!
      })
    }

    return rules
  }

  /**
   * Validate user download URL
   */
  validateDownloadUrl(url: string): ValidationResult {
    if (!url || url.trim() === '') {
      return {
        isValid: false,
        errorMessage: translate('module-validation-download-required', 'Download URL is required')
      }
    }

    const urlPattern = /^https?:\/\/.+/
    if (!urlPattern.test(url)) {
      return {
        isValid: false,
        errorMessage: translate('module-validation-download-invalid', 'A valid HTTP/HTTPS URL is required')
      }
    }

    return { isValid: true }
  }

  /**
   * Get download URL validation rules for Vuetify
   */
  getDownloadUrlRules(): Array<(value: string) => boolean | string> {
    return [
      (value: string) => {
        const result = this.validateDownloadUrl(value)
        return result.isValid || result.errorMessage!
      }
    ]
  }
}

// Export singleton instance
export const moduleValidationService = new ModuleValidationService()
