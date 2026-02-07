#!/usr/bin/env node

/**
 * Fixes import paths in compiled test files.
 * Changes '../src/...' to '../...' since tests are in dist/tests/ and src is in dist/
 */

const fs = require('fs');
const path = require('path');

function fixImportsInFile(filePath) {
  let content = fs.readFileSync(filePath, 'utf8');
  
  // Replace require("../src/...") with require("../...")
  content = content.replace(/require\("\.\.\/src\/([^"]+)"\)/g, 'require("../$1")');
  // Replace from "../src/..." with from "../..."
  content = content.replace(/from "\.\.\/src\/([^"]+)"/g, 'from "../$1"');
  
  fs.writeFileSync(filePath, content, 'utf8');
}

function walkDir(dir) {
  const files = fs.readdirSync(dir);
  
  for (const file of files) {
    const filePath = path.join(dir, file);
    const stat = fs.statSync(filePath);
    
    if (stat.isDirectory()) {
      walkDir(filePath);
    } else if (file.endsWith('.js') && file.includes('.test.')) {
      fixImportsInFile(filePath);
    }
  }
}

const testsDir = path.join(__dirname, '..', 'dist', 'tests');
if (fs.existsSync(testsDir)) {
  walkDir(testsDir);
  console.log('✅ Fixed test import paths');
} else {
  console.log('⚠️  Tests directory not found, skipping');
}
