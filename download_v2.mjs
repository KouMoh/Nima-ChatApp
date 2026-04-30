import fs from "fs";
import https from "https";

// Use the URL from the user's screenshot - GitHub raw
const url = "https://raw.githubusercontent.com/KouMoh/Nima-ChatApp/main/src/assets/indian_kanoon_logo.png";
const dest = "./src/assets/logo_new.png";

const download = (url, dest) => {
  return new Promise((resolve, reject) => {
    https.get(url, (res) => {
      if (res.statusCode === 301 || res.statusCode === 302) {
        return download(res.headers.location, dest).then(resolve).catch(reject);
      }
      if (res.statusCode !== 200) {
        reject(new Error(`Failed to download: ${res.statusCode}`));
        return;
      }
      const file = fs.createWriteStream(dest);
      res.pipe(file);
      file.on("finish", () => {
        file.close();
        resolve();
      });
    }).on("error", (err) => {
      reject(err);
    });
  });
};

download(url, dest)
  .then(() => console.log("Download complete"))
  .catch((err) => console.error(err.message));
