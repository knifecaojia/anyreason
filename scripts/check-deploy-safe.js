#!/usr/bin/env node
/**
 * Regression check for forbidden localhost patterns in deploy/runtime code.
 * 
 * This script fails if forbidden patterns are found:
 * 1. NEXT_PUBLIC_API_BASE_URL=localhost in deploy compose files (hardcoded, not as fallback)
 * 2. http://localhost:8000 or http://127.0.0.1:8000 in runtime code (except centralized dev fallback)
 * 
 * Run: node scripts/check-deploy-safe.js
 */

const fs = require('fs');
const path = require('path');

// Directories to scan
const DEPLOY_DIRS = ['docker', 'docker-deploy'];
const RUNTIME_DIRS = ['nextjs-frontend', 'fastapi_backend'];

// Files that are allowed to have localhost dev fallback (centralized dev fallback)
const ALLOWED_DEV_FALLBACK_FILES = [
  'serverApiConfig.ts',
  'clientConfig.ts',
];

// File patterns to exclude from check (applied to full path)
const EXCLUDE_PATTERNS = [
  /\/test\//i,
  /\/spec\//i,
  /\/tests\//i,
  /\/conftest\./i,
  /\.test\./,
  /\.spec\./,
  /\.test\//,
  /test_/,
  /-test\./,           // test-fetch.js pattern
  /\/node_modules\//,
  /\/refs\//,
  /\/\.git\//,
  /\/dist\//,
  /\/build\//,
  /\/__pycache__\//,
  /\\.next\\/,       // Windows path
  /\/\.next\//,     // Unix path
  /\\.venv\\/,      // Windows path - Python virtual env
  /\/\.venv\//,     // Unix path - Python virtual env
];

// File extensions to include (source files only)
const INCLUDE_EXTENSIONS = ['.ts', '.tsx', '.js', '.jsx', '.py', '.yml', '.yaml'];

// Forbidden patterns
const FORBIDDEN_DEPLOY_PATTERNS = [
  /NEXT_PUBLIC_API_BASE_URL\s*=\s*localhost/i,
];

const FORBIDDEN_RUNTIME_PATTERNS = [
  /http:\/\/localhost:8000/,
  /http:\/\/127\.0\.0\.1:8000/,
];

let errors = [];

/**
 * Check if file matches any exclude pattern
 */
function isExcluded(filePath) {
  const normalizedPath = filePath.replace(/\\/g, '/');
  return EXCLUDE_PATTERNS.some(pattern => pattern.test(normalizedPath));
}

/**
 * Check if file should be scanned based on extension
 */
function shouldScanFile(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  return INCLUDE_EXTENSIONS.includes(ext);
}

/**
 * Check if file is a centralized dev fallback (allowed to have localhost)
 */
function isAllowedDevFallback(filePath) {
  const fileName = path.basename(filePath);
  return ALLOWED_DEV_FALLBACK_FILES.includes(fileName);
}

/**
 * Scan a file for forbidden patterns
 */
function scanFile(filePath, patterns, isDeployFile = false) {
  // Skip non-source files
  if (!shouldScanFile(filePath)) {
    return;
  }
  
  const content = fs.readFileSync(filePath, 'utf-8');
  const lines = content.split('\n');
  
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const lineNum = i + 1;
    
    for (const pattern of patterns) {
      if (pattern.test(line)) {
        // For deploy files, check if it's a hardcoded value (not a fallback with ${...:-...})
        if (isDeployFile) {
          // Skip if it's a fallback like ${FRONTEND_URL:-http://localhost:3000}
          if (/\$\{[^}]*:\s*http:\/\/localhost/.test(line)) {
            continue;
          }
          // Skip comments
          if (line.trim().startsWith('#')) {
            continue;
          }
        }
        
        // For runtime files, skip if it's an allowed dev fallback file
        if (!isDeployFile && isAllowedDevFallback(filePath)) {
          // Only allow in development-specific blocks
          if (line.includes('NODE_ENV') && line.includes('development')) {
            continue;
          }
          // Allow the specific fallback return statement
          if (line.includes('http://127.0.0.1:8000') && (line.includes('return') || line.includes('?'))) {
            continue;
          }
        }
        
        errors.push(`${filePath}:${lineNum}: ${line.trim()}`);
      }
    }
  }
}

/**
 * Scan directory recursively for files
 */
function scanDirectory(dir, patterns, isDeployFile = false) {
  if (!fs.existsSync(dir)) {
    return;
  }
  
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    
    if (entry.isDirectory()) {
      if (!isExcluded(fullPath)) {
        scanDirectory(fullPath, patterns, isDeployFile);
      }
    } else if (entry.isFile()) {
      if (!isExcluded(fullPath)) {
        scanFile(fullPath, patterns, isDeployFile);
      }
    }
  }
}

// Main execution
console.log('=== Checking for forbidden localhost patterns ===\n');

// Check deploy compose files
console.log('Checking deploy compose files...');
for (const deployDir of DEPLOY_DIRS) {
  const dirPath = path.join(__dirname, '..', deployDir);
  if (fs.existsSync(dirPath)) {
    const files = fs.readdirSync(dirPath);
    for (const file of files) {
      if (file.startsWith('docker-compose') && (file.endsWith('.yml') || file.endsWith('.yaml'))) {
        const filePath = path.join(dirPath, file);
        console.log(`  Scanning: ${filePath}`);
        scanFile(filePath, FORBIDDEN_DEPLOY_PATTERNS, true);
      }
    }
  }
}

// Check runtime code
console.log('\nChecking runtime code...');
for (const runtimeDir of RUNTIME_DIRS) {
  const dirPath = path.join(__dirname, '..', runtimeDir);
  if (fs.existsSync(dirPath)) {
    console.log(`  Scanning: ${dirPath}`);
    scanDirectory(dirPath, FORBIDDEN_RUNTIME_PATTERNS, false);
  }
}

// Report results
console.log('\n=== Results ===');
if (errors.length > 0) {
  console.log('\nFAILED: Forbidden localhost patterns found:\n');
  errors.forEach(err => console.log(`  ${err}`));
  console.log('\n');
  process.exit(1);
} else {
  console.log('\nPASSED: No forbidden localhost patterns found.\n');
  process.exit(0);
}
