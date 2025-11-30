import 'vuetify/styles'
import '@mdi/font/css/materialdesignicons.css'
import { createVuetify } from 'vuetify'
import * as components from 'vuetify/components'
import * as directives from 'vuetify/directives'

export default createVuetify({
  components,
  directives,
  theme: {
    defaultTheme: 'light',
    themes: {
      light: {
        colors: {
          // 更新主色调 - 更现代的蓝色
          primary: '#2563eb',
          secondary: '#64748b',
          accent: '#8b5cf6',
          // 更新语义色 - 更柔和的现代色调
          error: '#ef4444',
          info: '#3b82f6',
          success: '#10b981',
          warning: '#f59e0b'
        }
      }
    }
  }
})
