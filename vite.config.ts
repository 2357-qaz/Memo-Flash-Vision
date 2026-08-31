import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  base:'./',
  plugins:[
    react(),
    VitePWA({
      registerType:'autoUpdate',
      includeAssets:['icon.svg'],
      manifest:{
        name:'Memo Flashcards',short_name:'Memo',
        description:'Offline-first flashcards with review history and spaced repetition.',
        theme_color:'#f4efe5',background_color:'#f4efe5',
        display:'standalone',orientation:'portrait',
        icons:[{src:'icon.svg',sizes:'any',type:'image/svg+xml',purpose:'any maskable'}]
      }
    })
  ]
});
