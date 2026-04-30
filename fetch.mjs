const res = await fetch(process.argv[2]);
console.log(await res.text());
