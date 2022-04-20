/* eslint-disable no-async-promise-executor */
import fs from 'fs';
import path from 'path';
import yaml from 'js-yaml';
import archiver from 'archiver';
import { randomBytes } from 'crypto';
import { getTransformedScript } from '@quajs/get-func-exports';
import type { Command } from 'commander';
import type { Action, LangMeta, ProjectMeta, ScriptData, ProjectBundleMeta, Step } from '../types/meta';
import type { FileRecords } from '../types/log';
import { getAllKeys, QuaFileList, walk } from '../utils';
import { getFileRecord } from '../utils/build';

const RandomBytesLength = 16;
const timeRegex = /([0-9]+):([0-6][0-9]).?([0-9]*)/;

interface PackCommandOptions {
  output: string;
  diff?: string;
  build?: string;
  dev?: boolean;
}

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
    const pairActionLines = pairAction.split(/\r?\n/);
    const lastLine = pairActionLines[pairActionLines.length - 1];

    const includeColonOrDash = lastLine.includes(':') || lastLine.includes('-');
    const wrappedWithQuote =
      lastLine.startsWith("'") && lastLine.endsWith("'") && lastLine.startsWith('"') && lastLine.endsWith('"');
    if (!includeColonOrDash || (includeColonOrDash && wrappedWithQuote)) {
      pairActionLines.pop();
      pairActionLines.push('narration: ' + lastLine);
      pairAction = pairActionLines.join('\n');
    }

    const actionStatementPair: Partial<Step> = yaml.load(pairAction) as Partial<Step>;
    const allKeys = Object.keys(actionStatementPair);
    const subject = allKeys[allKeys.length === 1 ? 0 : allKeys.length - 1];
    const statementContent = actionStatementPair[subject as keyof typeof actionStatementPair];
    const content: Step = {
      action: {
        '0': {
          dialog: {
            subject,
            content: statementContent
          }
        }
      },
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
  const scriptData: ScriptData = { script: {}, control: {}, entry: '', character: {} };
  const scriptPath = path.join(entryPath, 'scripts', lang === 'default' ? '' : lang);
  const langMeta = yaml.load(fs.readFileSync(path.join(scriptPath, 'meta.yml'), 'utf8')) as LangMeta;
  let fileAlias: LangMeta['resources'] = {};
  if (langMeta.entry) {
    scriptData.entry = langMeta.entry;
  }
  if (langMeta.character) {
    scriptData.character = langMeta.character;
  }

  for await (const found of walk(scriptPath)) {
    if (found.path === scriptPath) {
      continue;
    }

    if (langMeta.resources) {
      fileAlias = langMeta.resources;
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

interface CreateMetaFilesContext {
  projectBundleMeta: ProjectBundleMeta;
  outputPath: string;
}

const createMetaFiles = async (
  packRes: {
    lang: string;
    resources: string[];
    scriptData: ScriptData;
  }[],
  context: CreateMetaFilesContext,
) => {
  const { projectBundleMeta, outputPath } = context;
  await Promise.all(
    packRes.map((res) => {
      projectBundleMeta.resources[res.lang] = res.resources;
      projectBundleMeta.langs.push(res.lang);
      const scriptFileName = `${res.lang}.json`;
      return fs.promises.writeFile(path.join(outputPath, scriptFileName), JSON.stringify(res.scriptData));
    }),
  );
  fs.writeFileSync(path.join(outputPath, 'meta.json'), JSON.stringify(projectBundleMeta));
};

interface CreateResourcePackContext {
  projectMeta: ProjectMeta;
  projectBundleMeta: ProjectBundleMeta;
  entryPath: string;
  outputPath: string;
  tempPath: string;
  isDevMode: boolean;
}

const createResourcePack = async (context: CreateResourcePackContext): Promise<void> => {
  const { projectMeta, projectBundleMeta, entryPath, outputPath, tempPath, isDevMode } = context;
  // create build log files
  const fileRecords: FileRecords = {};
  // determine the output file format
  const outputFileName = `./${projectMeta.name}.${isDevMode ? 'zip' : 'qak'}`;
  const output = fs.createWriteStream(path.resolve(outputPath, outputFileName));
  if (!isDevMode) {
    // write random bytes to the file header
    await new Promise<void>((resolve, reject) => {
      output.write(randomBytes(RandomBytesLength), (err) => {
        if (err) {
          reject(err);
        }
        resolve();
      });
    });
  }
  const archive = archiver('zip', {
    zlib: { level: 9 },
  });
  return await new Promise(async (resolve, reject) => {
    archive.on('error', (err: unknown) => {
      reject(err);
    });
    archive.pipe(output);
    // bundle compiled files under the temp path
    const recursiveArchive = async (base: string, namePrefix = '') => {
      const dirInfos = await fs.promises.readdir(base);
      await Promise.all(
        dirInfos.map(async (fileName: string) => {
          const filePath = path.resolve(base, fileName);
          const stat = await fs.promises.stat(filePath);
          if (stat.isDirectory()) {
            await recursiveArchive(filePath, namePrefix ? `${namePrefix}/${fileName}` : fileName);
            return;
          }
          // archive file
          const fileRecord = await getFileRecord(filePath, stat);
          const name = `${namePrefix}/${fileName}`;
          fileRecords[name] = fileRecord;
          archive.file(filePath, { name });
        }),
      );
    };
    await recursiveArchive(tempPath);
    // bundle resources
    const allResources: string[] = [];
    projectBundleMeta.langs.forEach((lang) => {
      allResources.push(...projectBundleMeta.resources[lang].filter((v) => !allResources.includes(v)));
    });
    await Promise.all(
      allResources.map(async (resPath) => {
        const resolved = path.join(entryPath, 'resources', resPath);
        const name = `resources/${resPath}`;
        const fileRecord = await getFileRecord(resolved);
        fileRecords[name] = fileRecord;
        archive.file(resolved, { name });
      }),
    );
    archive.on('error', (err: unknown) => {
      reject(err);
    });
    archive.on('finish', () => {
      resolve();
    });
    output.on('close', async () => {
      // TODO: save build log
      // remove temp files
      await fs.promises.rm(tempPath, { recursive: true, force: true });
    });
    archive.finalize();
  });
};

const register = (program: Command) => {
  program
    .description('Pack project folder as ".qak" file.')
    .argument('[path]', 'path of project folder')
    .option('-o, --output <path>', 'output path')
    .option('--diff <build>', 'build diff pack')
    .option('--build <build>', 'build number')
    .option('--dev', 'development mode')
    .alias('p')
    .action(async (workDir, options: PackCommandOptions) => {
      const entryPath = workDir || process.cwd();
      const projectMeta: ProjectMeta = yaml.load(
        fs.readFileSync(path.join(entryPath, 'meta.yml'), 'utf8'),
      ) as ProjectMeta;
      const langs: string[] = projectMeta.langs ? projectMeta.langs : ['default'];
      // do pack files
      const projectBundleMeta: ProjectBundleMeta = { langs: [], resources: {}, name: projectMeta.name };
      const packRes = await Promise.all(langs.map((lang) => packFiles(entryPath, lang)));
      // check output related dir
      const outputPath = path.resolve(options.output || './dist');
      const tempPath = path.resolve(process.cwd(), './temp');
      await Promise.all(
        [outputPath, tempPath].map((p) => {
          if (!fs.existsSync(p)) {
            return fs.promises.mkdir(p, { recursive: true });
          }
          return Promise.resolve();
        }),
      );
      // create meta files
      await createMetaFiles(packRes, {
        projectBundleMeta,
        outputPath: tempPath,
      });
      // create resouce pack
      await createResourcePack({
        projectMeta,
        projectBundleMeta,
        entryPath,
        tempPath,
        outputPath,
        isDevMode: !!options.dev,
      });
      // TODO: Create manifest json
    });
};

// TODO: Add programmatic APIs

export default {
  name: 'pack',
  register,
};
