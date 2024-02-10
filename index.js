const fs = require('fs');
const { join } = require('path');

const localRepo = fs.readFileSync(join(__dirname, 'local-repo-location.txt'), 'utf8').trim();
const licenseRoots = ["apache", "ofl", "ufl"];
const allFonts = [];

for (const license of licenseRoots) {
    const licenseDir = join(localRepo, license);
    addFontsFromLicenseRoot(licenseDir, license);
}

function addFontsFromLicenseRoot(root, license) {
    const files = fs.readdirSync(root);
    files.sort();
    for (const fontDir of files) {
        const fontDirAbs = join(root, fontDir);
        const stat = fs.statSync(fontDirAbs);
        if (stat.isDirectory()) {
            let fonts = listFontsIn(fontDirAbs);
            if (fonts && fonts.length > 0) {
                allFonts.push({ path: `${license}/${fontDir}`, fonts});
            }
        }
    }
}

function listFontsIn(dir) {
    const files = fs.readdirSync(dir).filter(
        file => file.endsWith('.ttf') || file.endsWith('.otf') || file.endsWith('.ttc')    
    );
    if (files.length === 0) return null;
    files.sort();
    return files;
}

let javaProperties = "";
for (let i=0; i<allFonts.length; i++) {
    const { path, fonts } = allFonts[i];
    javaProperties += `${path}=${fonts.join(',')}\n`;
}

fs.writeFileSync(join(__dirname, 'metadata.properties'), javaProperties.trim());