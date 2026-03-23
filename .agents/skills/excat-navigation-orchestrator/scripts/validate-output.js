#!/usr/bin/env node
/**
 * Deterministic validation: sub-agent JSON output against JSON Schema.
 * Use before accepting any sub-agent output (orchestrator step gate).
 * No external dependencies (Node only).
 *
 * Usage: node scripts/validate-output.js <path-to-output.json> <path-to-schema.json>
 * Exit: 0 if valid, 1 if invalid (errors to stderr).
 */

import fs from 'fs';
import path from 'path';

function checkRequired(schema, data, pathPrefix = '') {
  const required = schema.required || [];
  const errors = [];
  for (const key of required) {
    if (!(key in data)) {
      errors.push(`${pathPrefix}missing required property: ${key}`);
    }
  }
  if (schema.properties) {
    for (const [key, prop] of Object.entries(schema.properties)) {
      const val = data[key];
      if (val === undefined) continue;
      if (prop.type === 'object' && val !== null && prop.properties) {
        errors.push(...checkRequired(prop, val, `${pathPrefix}${key}.`));
      }
      if (prop.type === 'array' && Array.isArray(val) && prop.items && prop.items.type === 'object') {
        val.forEach((item, i) => {
          errors.push(...checkRequired(prop.items, item, `${pathPrefix}${key}[${i}].`));
        });
      }
    }
  }
  if (schema.oneOf) {
    const oneOfErrors = schema.oneOf.map((s) => checkRequired(s, data, pathPrefix));
    const valid = oneOfErrors.some((e) => e.length === 0);
    if (!valid) {
      errors.push(`${pathPrefix}must match one of the oneOf schemas`);
    }
  }
  return errors;
}

function main() {
  const args = process.argv.slice(2);
  if (args.length < 2) {
    console.error('Usage: node validate-output.js <output.json> <schema.json>');
    process.exit(1);
  }
  const outputPath = path.resolve(args[0]);
  const schemaPath = path.resolve(args[1]);
  if (!fs.existsSync(outputPath)) {
    console.error('Error: output file not found:', outputPath);
    process.exit(1);
  }
  if (!fs.existsSync(schemaPath)) {
    console.error('Error: schema file not found:', schemaPath);
    process.exit(1);
  }
  let data, schema;
  try {
    data = JSON.parse(fs.readFileSync(outputPath, 'utf8'));
  } catch (e) {
    console.error('Error: invalid JSON in output:', e.message);
    process.exit(1);
  }
  try {
    schema = JSON.parse(fs.readFileSync(schemaPath, 'utf8'));
  } catch (e) {
    console.error('Error: invalid JSON in schema:', e.message);
    process.exit(1);
  }
  const errors = checkRequired(schema, data);
  if (schema.oneOf) {
    const oneOfOk = schema.oneOf.some((s) => checkRequired(s, data).length === 0);
    if (!oneOfOk) errors.push('Output must match one of the defined output schemas (e.g. rowDetection or rowMapping).');
  }
  if (errors.length > 0) {
    console.error('Validation FAILED:');
    errors.forEach((e) => console.error('  ', e));
    process.exit(1);
  }
  process.exit(0);
}

main();
