import fs from 'fs';
const local = fs.readFileSync('src/pages/ChatRoom.tsx', 'utf8');
const github = fs.readFileSync('/tmp/ChatRoom_github.tsx', 'utf8');
if (local === github) {
  console.log("Files are EXACTLY identical!");
} else {
  console.log(`Local length: ${local.length}, GitHub length: ${github.length}`);
}
