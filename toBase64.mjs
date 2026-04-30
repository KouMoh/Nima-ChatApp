import fs from 'fs';
const base64 = fs.readFileSync('./src/assets/indian_kanoon_logo.png').toString('base64');
fs.writeFileSync('base64_logo.txt', base64);
