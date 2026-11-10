import {defineConfig} from '../../../frontend/node_modules/vite/dist/node/index.js';
import {fileURLToPath} from 'node:url';
const frontend=fileURLToPath(new URL('../../../frontend/',import.meta.url));
const root=fileURLToPath(new URL('../../../',import.meta.url));
export default defineConfig({esbuild:{jsx:"automatic",jsxImportSource:"react"},resolve:{alias:{react:frontend+'node_modules/react','react-dom':frontend+'node_modules/react-dom'}},css:{postcss:frontend},server:{fs:{allow:[root,"/workspace/relationship-validation"]},host:'127.0.0.1',port:5186,strictPort:true}});
