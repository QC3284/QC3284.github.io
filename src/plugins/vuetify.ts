import 'vuetify/styles'
import '@mdi/font/css/materialdesignicons.css'
import { createVuetify, type ThemeDefinition } from 'vuetify'
import * as components from 'vuetify/components'
import * as directives from 'vuetify/directives'

// 定义完整的自定义亮色主题
const lightTheme: ThemeDefinition = {
  dark: false,
  colors: {
    // 主品牌色
    primary: '#2563eb',
    secondary: '#64748b',
    accent: '#8b5cf6',
    
    // 语义化颜色
    error: '#ef4444',
    info: '#3b82f6', 
    success: '#10b981',
    warning: '#f59e0b',
    
    // 中性色
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
  
  // 优化默认配置，解决遮挡问题
  defaults: {
    global: {
      ripple: true,
      elevation: 2,
      // 确保足够的密度，避免内容被裁剪
      density: 'comfortable' // 'compact' | 'comfortable' | 'default'
    },
    VBtn: {
      variant: 'flat',
      color: 'primary',
      minWidth: 44, // 确保按钮有最小宽度
      height: 40,   // 固定高度避免被挤压
      class: 'text-none' // 禁用字母大写转换
    },
    VCard: {
      elevation: 2,
      rounded: 'lg',
      class: 'ma-2' // 添加外边距避免重叠
    },
    VTextField: {
      color: 'primary',
      variant: 'outlined',
      density: 'comfortable',
      hideDetails: false // 确保错误信息能显示
    },
    VSelect: {
      color: 'primary', 
      variant: 'outlined',
      density: 'comfortable',
      hideDetails: false
    },
    VTextarea: {
      color: 'primary',
      variant: 'outlined',
      density: 'comfortable',
      hideDetails: false,
      autoGrow: true // 自动增长避免内容被裁剪
    },
    VMenu: {
      // 确保菜单有足够空间显示
      maxHeight: 300,
      contentClass: 'elevation-4'
    },
    VDialog: {
      // 对话框相关配置
      persistent: false,
      maxWidth: 600
    },
    VTooltip: {
      // 工具提示配置
      location: 'top'
    },
    // 确保列表项有足够高度
    VList: {
      density: 'comfortable'
    },
    VListItem: {
      density: 'comfortable',
      minHeight: 48
    },
    // 导航抽屉配置
    VNavigationDrawer: {
      floating: true,
      temporary: true
    }
  },
  
  // 添加显示配置
  display: {
    mobileBreakpoint: 'sm',
    thresholds: {
      xs: 0,
      sm: 600,
      md: 960,
      lg: 1264,
      xl: 1904
    }
  }
})
