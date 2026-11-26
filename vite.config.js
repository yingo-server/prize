import { defineConfig } from 'vite';
import { resolve } from 'path';

// 双入口：main 分支构建 2.5D 版（src/main.js），3d 分支构建 Three.js 版（src3d/main3d.js）
const is3d = process.env.BUILD_3D === '1';

export default defineConfig({
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    target: 'es2020',
    chunkSizeWarningLimit: 1600,
  },
  resolve: {
    // three 由 npm 依赖正常打包
  },
});
