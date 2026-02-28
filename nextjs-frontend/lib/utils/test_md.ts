import { stripMarkdownMetadata } from "./markdown";

const test1 = `---
title: Test
---
# Header
Content`;

const test2 = `Key: Value
Another: Value

Actual content`;

const test3 = `
   
Key: Value
   
Real content`;

console.log("Test 1:", stripMarkdownMetadata(test1));
console.log("Test 2:", stripMarkdownMetadata(test2));
console.log("Test 3:", stripMarkdownMetadata(test3));
