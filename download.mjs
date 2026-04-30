import fs from "fs";
import https from "https";

const url = "https://raw.githubusercontent.com/KouMoh/Nima-ChatApp/main/src/assets/indian_kanoon_logo.png";
const dest = "./src/assets/indian_kanoon_logo.png";

https.get(url, (res) => {
  if (res.statusCode !== 200) {
    console.error("Failed to download", res.statusCode);
    process.exit(1);
  }
  const file = fs.createWriteStream(dest);
  res.pipe(file);
  file.on("finish", () => {
    file.close();
    console.log("Download complete");
  });
}).on("error", (err) => {
  console.error("Error", err.message);
  process.exit(1);
});
