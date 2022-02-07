import fs from 'fs';
import path from 'path';
import yaml from 'js-yaml';
import { getTransformedScript } from '@quajs/get-func-exports';
import type { Command } from 'commander';
import type { Action, LangMeta, ProjectMeta, ScriptData, ProjectBundleMeta, StatementActionPair } from '../types/meta';
import { getAllKeys, QuaFileList, walk } from '../utils';
import archiver from 'archiver';

const timeRegex = /([0-9]+):([0-6][0-9]).?([0-9]*)/;

interface PackQsFileContext {
  scriptData: ScriptData;
  scriptNamespace: string;
  parsedScriptPath: path.ParsedPath;
  fileList: QuaFileList;
  filePath: string;
}

const packQsFile = (context: PackQsFileContext) => {
  const { scriptNamespace, parsedScriptPath, fileList, filePath, scriptData } = context;
  let qScriptLoc = scriptNamespace + '/' + parsedScriptPath.name;
  scriptData.script[qScriptLoc] = [];
  let scriptContent = fs.readFileSync(path.join(fileList.path, filePath), 'utf8').split(/\r?\n\r?\n/);
  for (let pairAction of scriptContent) {
    let pairActionLines = pairAction.split(/\r?\n/);
    let lastLine = pairActionLines[pairActionLines.length - 1];

    const includeColonOrDash = lastLine.includes(':') || lastLine.includes('-');
    const wrappedWithQuote =
      lastLine.startsWith("'") && lastLine.endsWith("'") && lastLine.startsWith('"') && lastLine.endsWith('"');
    if (!includeColonOrDash || (includeColonOrDash && wrappedWithQuote)) {
      pairActionLines.pop();
      pairActionLines.push('narration: ' + lastLine);
      pairAction = pairActionLines.join('\n');
    }

    let actionStatementPair: Partial<StatementActionPair> = yaml.load(pairAction) as Partial<StatementActionPair>;
    let allKeys = Object.keys(actionStatementPair);
    const subject = allKeys[allKeys.length === 1 ? 0 : allKeys.length - 1];
    const statementContent = actionStatementPair[subject as keyof typeof actionStatementPair];
    const content: StatementActionPair = {
      statement: {
        subject,
        content: statementContent,
      },
      action: {},
    };
    if (allKeys.length > 1) {
      // remove last key, the last one is dialog.
      allKeys.pop();
      allKeys.forEach((action) => {
        const timeMatch = action.match(timeRegex);
        if (timeMatch) {
          let time = parseInt(timeMatch[1], 10) * 60 + parseInt(timeMatch[2], 10);
          if (timeMatch[3] !== '') {
            time += parseInt(timeMatch[3], 10) / Math.pow(10, timeMatch[3].length);
          }
          if (!content.action) content.action = {};
          content.action[`${time}`] = actionStatementPair[action as keyof typeof actionStatementPair] as Action;
          return;
        }
        if (!content.action) {
          content.action = {};
        }
        if (!content.action['0']) {
          content.action['0'] = {};
        }
        content.action['0'][action] = actionStatementPair[action as keyof typeof actionStatementPair];
      });
    }
    scriptData.script[qScriptLoc].push(content);
  }
};

interface PackJsFileContext {
  fileList: QuaFileList;
  scriptData: ScriptData;
  scriptPath: string;
  filePath: string;
}

const packJsFile = (context: PackJsFileContext) => {
  const { fileList, scriptData, scriptPath, filePath } = context;
  const scriptContent: string = fs.readFileSync(path.join(fileList.path, filePath), 'utf8');
  if (!scriptData.control[scriptPath]) {
    scriptData.control[scriptPath] = [];
  }
  const transformed = getTransformedScript(scriptContent);
  scriptData.control[scriptPath].push(transformed);
};

// pack files for each lang
const packFiles = async (entryPath: string, lang: string) => {
  const scriptData: ScriptData = { script: {}, control: {}, entry: "", character: {} };
  const scriptPath = path.join(entryPath, 'scripts', lang === 'default' ? '' : lang);
  const langMeta = yaml.load(fs.readFileSync(path.join(scriptPath, 'meta.yml'), 'utf8')) as LangMeta;
  let fileAlias: LangMeta["resources"] = {};
  if (langMeta.entry) {
    scriptData.entry = langMeta.entry;
  }
  if (langMeta.character) {
    scriptData.character = langMeta.character
  }

  for await (const found of walk(scriptPath)) {
    if (found.path === scriptPath) {
      continue;
    }

    if (langMeta.resources) {
      fileAlias = langMeta.resources
    }

    const scriptNamespace = found.path
      .split(path.sep)
      .join(path.posix.sep)
      .replace(scriptPath.split(path.sep).join(path.posix.sep), '');

    found.file.forEach((filePath) => {
      const parsedScriptPath = path.parse(filePath);
      const packActions: Record<string, () => void> = {
        '.qs': () =>
          packQsFile({
            scriptNamespace,
            scriptData,
            fileList: found,
            parsedScriptPath,
            filePath,
          }),
        '.js': () =>
          packJsFile({
            fileList: found,
            scriptData,
            scriptPath,
            filePath,
          }),
      };
      const packAction = packActions[parsedScriptPath.ext];
      if (!packAction) {
        return;
      }
      packAction();
    });
  }
  return {
    lang,
    resources: getAllKeys('file', scriptData, fileAlias),
    scriptData,
  };
};

const register = (program: Command) => {
  program
    .command('pack')
    .argument('[path]', 'path of project folder')
    .alias('p')
    .action(async (p) => {
      const entryPath = p || process.cwd();
      const projectMeta: ProjectMeta = yaml.load(
        fs.readFileSync(path.join(entryPath, 'meta.yml'), 'utf8'),
      ) as ProjectMeta;
      const langs: string[] = projectMeta.langs ? projectMeta.langs : ['default'];
      // do pack files
      const projectBundleMeta: ProjectBundleMeta = {"langs": [], "resources": {}, "name": projectMeta.name};
      const packRes = await Promise.all(langs.map((lang) => packFiles(entryPath, lang)));
      // write to output
      const outputPath = './dist';
      if (!fs.existsSync(outputPath)) {
        fs.mkdirSync(outputPath);
      }
      packRes.forEach((res) => {
        projectBundleMeta.resources[res.lang] = res.resources;
        projectBundleMeta.langs.push(res.lang);
        const scriptFileName = `${res.lang}.json`;
        fs.writeFileSync(path.join(outputPath, scriptFileName), JSON.stringify(res.scriptData));
      });
      fs.writeFileSync(path.join(outputPath, "meta.json"), JSON.stringify(projectBundleMeta));
      const output = fs.createWriteStream(projectMeta.name + ".zip");
      const archive = archiver('zip', {
        zlib: { level: 9 }
      });
      archive.on('error', function(err) {
        throw err;
      });
      archive.pipe(output);
      archive.directory(outputPath, false);
      let allResources: string[] = []
      projectBundleMeta.langs.forEach(lang => {
        allResources = allResources.concat(projectBundleMeta.resources[lang].filter(v => !allResources.includes(v)))
      })
      allResources.forEach(resPath => {
        archive.file(path.join(entryPath, "resources", resPath), { name: "resources/" + resPath });
      })
      output.on('close', () => {
        fs.rmSync(outputPath, { recursive: true, force: true });
      })
      archive.on('error', function(err) {
        throw err;
      });
      archive.finalize();
    });
};

export default {
  name: 'pack',
  register,
};
