const fs = require('fs');
const { join } = require('path');
const { createHash } = require('crypto');

const allFonts = [];
const localRepo = fs.readFileSync(join(__dirname, 'local-repo-location.txt'), 'utf8').trim();
const licenseRoots = ["apache", "ofl", "ufl"];
const ignoreList = ["jsmathcmbx10", "jsmathcmex10", "jsmathcmmi10", "jsmathcmr10", "jsmathcmsy10", "jsmathcmti10"];

for (const license of licenseRoots) {
    const licenseDir = join(localRepo, license);
    addFontsFromLicenseRoot(licenseDir, license);
}

function addFontsFromLicenseRoot(root, license) {
    const files = fs.readdirSync(root);
    files.sort();
    for (const fontDir of files) {
        if (ignoreList.includes(fontDir)) continue;
        const fontDirAbs = join(root, fontDir);
        const stat = fs.statSync(fontDirAbs);
        if (stat.isDirectory()) {
            let [fonts, hash] = listFontsIn(fontDirAbs);
            if (fonts && fonts.length > 0) {
                allFonts.push({ path: `${license}/${fontDir}`, fonts, hash});
            }
        }
    }
}

function listFontsIn(dir) {
    let hash = createHash('md5');
    const files = fs.readdirSync(dir).filter(
        file => file.endsWith('.ttf') || file.endsWith('.otf') || file.endsWith('.ttc')    
    );
    if (files.length === 0) return null;
    files.sort();
    for (const file of files) {
        const data = fs.readFileSync(join(dir, file));
        hash.update(file);
        hash.update(data);
    }
    return [files, hash.digest('hex')];
}

let javaProperties = "";
for (let i=0; i<allFonts.length; i++) {
    const { path, fonts, hash } = allFonts[i];
    javaProperties += `${path}=${fonts.join(',')},${hash}\n`;
}

fs.writeFileSync(join(__dirname, 'metadata.properties'), javaProperties.trim());