import fs from 'fs';
import path from 'path';

const uploadsDir = '/uploads';
try {
  const files = fs.readdirSync(uploadsDir);
  files.forEach(file => {
    const stats = fs.statSync(path.join(uploadsDir, file));
    console.log(`${file}: ${stats.size} bytes`);
  });
} catch (err) {
  console.error(err.message);
}
