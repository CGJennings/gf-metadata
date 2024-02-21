const fs = require('fs');
const { join } = require('path');
const { createHash } = require('crypto');
const { execSync } = require('child_process');
const zlib = require('zlib');

const localRepo = fs.readFileSync(join(__dirname, 'local-repo-location.txt'), 'utf8').trim();
const licenseRoots = ["apache", "ofl", "ufl"];
const ignoreList = [
    "jsmathcmbx10", "jsmathcmex10", "jsmathcmmi10", "jsmathcmr10", "jsmathcmsy10", "jsmathcmti10",
    // colour fonts --- there seems to be no metadata in the .pb files to easily detect this,
    // at least not at this time
    "notocoloremoji", "notocoloremojicompattest", "blakaink", "reemkufiink", "reemkufifun",
    "nabla", "arefruqaaink", "bungeespice", "foldit", "amiriquran", "cairoplay", "honk",
];

/**
 * Returns a version tag given a hash object to digest.
 * Clients only use this as a string key compared for equality,
 * so it can be any length and format as long as the result
 * can be part of a file name on a case insensitive file system.
 */
function versionTagFromDigest(hashToDigest) {
    // 12 hex digits is 48 bits, string length 10,
    // a good balance of length and uniqueness
    const HEX_DIGITS_TO_USE = 12;
    const hexDigest = hashToDigest.digest('hex').substring(0, HEX_DIGITS_TO_USE);
    return BigInt(`0x${hexDigest}`).toString(36);
}

function pullChangesToLocalFontRepo() {
    try {
        console.log("pulling changes...")
        execSync('git pull', { cwd: localRepo });
    } catch (error) {
        console.error('Failed to pull the latest changes:', error);
    }    
}

function pushChangesToRemoteMetadataRepo() {
    try {
        console.log("pushing changes...")
        execSync('git add *', { cwd: __dirname });
        execSync('git commit -m "autoupdate metadata"', { cwd: __dirname });
        execSync('git push', { cwd: __dirname });
    } catch (error) {
        console.error('Failed to commit and push metadata.properties:', error);
    }
}

/** Adds all fonts under one of the dirs named for license type ('ofl', etc.). */
function addFontsFromLicenseRoot(allFonts, root, license) {
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
        return [files, versionTagFromDigest(hash)];
    }

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

let allCats = new Set();
let allSets = new Set();

function decodePBFile(path) {
    const pbFile = join(path, 'METADATA.pb');
    if (!fs.existsSync(pbFile)) return null;

    let name = null;
    let designer = null;
    let cat = new Set();
    let axes = [];
    let sets = [];

    const pb = fs.readFileSync(pbFile, 'utf8');
    const lines = pb.split('\n');

    let child;
    let stack = [""]; // start with empty string to represent the root
    for (let line of lines) {
        const within = stack[stack.length - 1];
        const depth = stack.length - 1;
        line = line.trim();
        if (line.length === 0) continue;

        if (line === "}") {
            switch (stack.pop()) {
                case "axes": {
                    if (child.tag != null && child.min_value != null && child.max_value != null) {
                        axes.push(`${child.tag},${child.min_value},${child.max_value}`);
                    }
                }
                default: {
                }
            }
            child = null;
            continue;
        }

        if (line.endsWith("{")) {
            stack.push(line.substring(0, line.length - 1).trim());
            child = {};    
            continue;
        }

        let [key, value] = line.split(':').map(s => s.trim());
        if (!value) {
            // empty key is generally a comment
            if (key.length !== 0 && !key.startsWith('#')) {
                console.warn("skipping empty key " + key);
            }
            continue;
        }
        if (value.startsWith('"') && value.endsWith('"')) {
            value = value.substring(1, value.length - 1);
        }

        switch (within) {
            case "": {
                switch (key) {
                    case "name": name = value; break;
                    case "designer": designer = value; break;
                    case "category": cat.add(value); allCats.add(value); break;
                    case "subsets": if (value !== "menu") { sets.push(value); allSets.add(value); } break;
                    case "classifications": cat.add(value); allCats.add(value); break;
                }
                break;
            }
            case "axes": {
                switch (key) {
                    case "tag": child.tag = value; break;
                    case "min_value": child.min_value = value; break;
                    case "max_value": child.max_value = value; break;
                }
                break;
            }
            default: {
                continue;
            }
        }
    }

    let output = "";
    if (name == null) return null;
    output = `name=${name}`;
    if (designer != null && designer.trim().length > 0) output += `\ndsnr=${designer.trim()}`;
    if (cat.size> 0) output += `\ncats=${Array.from(cat).sort().join(',')}`;
    if (sets.length > 0) output += `\nsets=${sets.join(',')}`;
    if (axes.length > 0) output += `\naxes=${axes.join('|')}`;
    return output;
}

pullChangesToLocalFontRepo();

const allFonts = [];
for (const license of licenseRoots) {
    const licenseDir = join(localRepo, license);
    addFontsFromLicenseRoot(allFonts, licenseDir, license);
}
let javaProperties = "";
for (let i=0; i<allFonts.length; i++) {
    const { path, fonts, hash } = allFonts[i];
    let meta = decodePBFile(join(localRepo, path));
    if (meta == null) continue;
    javaProperties += `path=${path}\nlist=${fonts.join('|')}\n${meta}\nhash=${hash}\n`;
}
javaProperties = javaProperties.trim();

const versionCode = versionTagFromDigest(createHash('md5').update(javaProperties));
const header = `
# This file is automatically generated. Do not edit.
$version=${versionCode}
`.trim();

// add comments/metadata to top of properties
const metadataFile = join(__dirname, 'metadata.properties');
const gzFile = join(__dirname, 'metadata.gz');
fs.writeFileSync(metadataFile, header + '\n' + javaProperties);
fs.writeFileSync(join(__dirname, 'version'), versionCode);
fs.createReadStream(metadataFile).pipe(zlib.createGzip()).pipe(fs.createWriteStream(gzFile))
    .on('close', pushChangesToRemoteMetadataRepo);

console.log(`Categories: ${Array.from(allCats).sort().join(', ')}`);
console.log(`Subsets: ${Array.from(allSets).sort().join(', ')}`);