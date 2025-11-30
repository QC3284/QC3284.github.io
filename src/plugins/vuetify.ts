import 'vuetify/styles'
import '@mdi/font/css/materialdesignicons.css'
import { createVuetify, type ThemeDefinition } from 'vuetify'
import * as components from 'vuetify/components'
import * as directives from 'vuetify/directives'

// 定义完整的自定义亮色主题
const lightTheme: ThemeDefinition = {
  dark: false,
  colors: {
    // 主品牌色 - 更现代的蓝色
    primary: '#2563eb',
    secondary: '#64748b',
    accent: '#8b5cf6',
    
    // 语义化颜色 - 更柔和的现代色调
    error: '#ef4444',
    info: '#3b82f6', 
    success: '#10b981',
    warning: '#f59e0b',
    
    // 中性色 - 更好的灰度层次
    background: '#ffffff',
    surface: '#f8fafc',
    surfaceVariant: '#e2e8f0',
    
    // 文本颜色
    onPrimary: '#ffffff',
    onSecondary: '#ffffff', 
    onBackground: '#1e293b',
    onSurface: '#1e293b',
    onSurfaceVariant: '#475569',
    
    // 其他功能色
    outline: '#cbd5e1',
    shadow: '#000000'
  }
}

export default createVuetify({
  components,
  directives,
  
  // 主题配置
  theme: {
    defaultTheme: 'light',
    themes: {
      light: lightTheme
    }
  },
  
  // 添加一些默认配置提升体验
  defaults: {
    global: {
      ripple: true,
      elevation: 2
    },
    VBtn: {
      variant: 'flat',
      color: 'primary'
    },
    VCard: {
      elevation: 2,
      rounded: 'lg'
    },
    VTextField: {
      color: 'primary',
      variant: 'outlined'
    },
    VSelect: {
      color: 'primary', 
      variant: 'outlined'
    }
  }
})
