import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import ts from 'typescript';

const checkOnly = process.argv.includes('--check');
const files = execFileSync(
  'git',
  ['ls-files', '--cached', '--others', '--exclude-standard', '-z'],
  { encoding: 'utf8' },
)
  .split('\0')
  .filter((file) => /\.(ts|tsx)$/.test(file) && !file.endsWith('.d.ts'));

function isFunction(statement) {
  if (ts.isFunctionDeclaration(statement)) return true;
  if (!ts.isVariableStatement(statement)) return false;

  return statement.declarationList.declarations.some(
    ({ initializer }) =>
      initializer &&
      (ts.isArrowFunction(initializer) || ts.isFunctionExpression(initializer)),
  );
}

function tokens(source) {
  const parsed = ts.createSourceFile(
    'source.tsx',
    source,
    ts.ScriptTarget.Latest,
    true,
  );
  const result = [];

  function collect(node) {
    const children = node.getChildren(parsed);

    if (children.length) {
      children.forEach(collect);
    } else {
      result.push([node.kind, node.getText(parsed)]);
    }
  }

  collect(parsed);

  return JSON.stringify(result);
}

let failures = 0;

for (const file of files) {
  const original = readFileSync(file, 'utf8');
  const source = ts.createSourceFile(
    file,
    original,
    ts.ScriptTarget.Latest,
    true,
  );
  const insertions = new Set();

  function visit(node) {
    if (ts.isSourceFile(node) || ts.isBlock(node)) {
      const statements = node.statements;

      for (let index = 1; index < statements.length; index++) {
        const previous = statements[index - 1];
        const current = statements[index];
        const importGroup =
          ts.isImportDeclaration(previous) && ts.isImportDeclaration(current);
        const needsSpace =
          (ts.isSourceFile(node) && !importGroup) ||
          isFunction(previous) ||
          isFunction(current) ||
          ts.isReturnStatement(current);

        if (!needsSpace) continue;

        // Insert after the preceding line, preserving attached comments and
        // every existing token. Prettier handles indentation afterward.
        const newline = original.indexOf('\n', previous.end);
        const currentStart = current.getStart(source);

        if (newline < 0 || newline >= currentStart) continue;
        if (/^[ \t]*\r?\n/.test(original.slice(newline + 1))) continue;

        insertions.add(newline + 1);
      }
    }

    ts.forEachChild(node, visit);
  }

  visit(source);
  let formatted = original;

  for (const position of [...insertions].sort((a, b) => b - a)) {
    formatted = `${formatted.slice(0, position)}\n${formatted.slice(position)}`;
  }

  if (tokens(original) !== tokens(formatted)) {
    throw new Error(`Spacing must not change source tokens: ${file}`);
  }

  if (formatted === original) continue;

  if (checkOnly) {
    console.error(`Missing blank lines: ${file}`);
    failures++;
  } else {
    writeFileSync(file, formatted);
  }
}

if (failures) process.exitCode = 1;
