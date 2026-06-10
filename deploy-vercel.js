// Patch os.hostname to avoid Thai character issue in Vercel CLI
const os = require('os');
os.hostname = () => 'pos-server';
process.argv = ['node', 'vercel', ...process.argv.slice(2)];
require('C:/Users/parin/AppData/Roaming/npm/node_modules/vercel/dist/vc.js');
