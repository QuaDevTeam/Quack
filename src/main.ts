import commander from 'commander';
import { name, version } from '../package.json';
import fs from 'fs';
import path from 'path';
import yaml from 'js-yaml';

var timere = new RegExp("([0-9]+):([0-6][0-9])\.?([0-9]*)")
const program = new commander.Command();

program.name(name);
program.version(version);

async function* walk(dir: string) {
    let filelist: {
        path: string,
        file: string[]
    } = {path: dir, file: []}
    for await (const d of await fs.promises.opendir(dir)) {
        const entry = path.join(dir, d.name);
        if (d.isDirectory()) yield* walk(entry);
        else if (d.isFile()) filelist.file.push(d.name);
    }
    if (filelist.file.length > 0) yield filelist;
}


function getAllKeys(key: string, data: any): string[] {
    let result: string[] = []
    if (typeof data == "string") {
        return result
    }
    for (let item in data) {
        if (typeof data[item] == 'object') {
            if (data[item].constructor) {
                if (data[item].constructor.name == 'Object') {
                    result = result.concat(getAllKeys(key, data[item]))
                } else if (data[item].constructor.name == 'Array') {
                    for (let i = 0; i < data[item].length; i ++) {
                        result = result.concat(getAllKeys(key, data[item][i]))
                    }
                }
            }
        } else if (item == key) {
            result.push(data[key])
        }
    }
    return result
}

program
    .command('pack')
    .argument('<path>', 'path of project folder')
    .alias("p")
    .action(async function(p){
        let outputPath = "dist"
        if (!fs.existsSync(outputPath)){
            fs.mkdirSync(outputPath);
        }
        let project_meta: ProjectMeta = <ProjectMeta> yaml.load(fs.readFileSync(path.join(p, "meta.yml"), 'utf8'))
        let langs: string[] = project_meta['langs'] ? project_meta['langs'] : ["default"]
        let allResources: string[] = []

        for (let lang of langs) {
            let script_data: ScriptData = {"script": {}, "control":{}, "entry": {}}
            let script_file_name = lang + ".json"
            let script_path = path.join(p, "scripts", lang == "default" ? "": lang)
            let lang_meta = <LangMeta> yaml.load(fs.readFileSync(path.join(script_path, "meta.yml"), 'utf8'))
            if (lang_meta["entry"]) {
                script_data["entry"][lang] = lang_meta["entry"]
            }
            
            for await (const p of walk(script_path)) {
                if (p.path == script_path) continue;
                let yamlfile = p.file.indexOf("meta.yml")
                if (yamlfile === -1) continue;
                p.file.splice(yamlfile, 1)
                let section_meta: SectionMeta = <SectionMeta> yaml.load(fs.readFileSync(path.join(script_path, "meta.yml"), 'utf8'))
                
                let script_namespace = p.path.split(path.sep).join(path.posix.sep).replace(script_path.split(path.sep).join(path.posix.sep), "")
                for (let file of p.file) {
                    let script_name = path.parse(file)
                    if (script_name.ext == ".qs") {
                        let qscript_loc = script_namespace + "/" + script_name.name
                        script_data["script"][qscript_loc] = []
                        let script_content = fs.readFileSync(path.join(p.path, file), 'utf8').split(/\r?\n\r?\n/)
                        for (let pair_action of script_content) {
                            let pair_action_lines = pair_action.split(/\r?\n/)
                            let last_line = pair_action_lines[pair_action_lines.length - 1]
                            if(
                                !(last_line.includes(":") || last_line.includes("-")) || (last_line.includes(":") || last_line.includes("-")) && 
                                ((last_line.startsWith("'") && last_line.endsWith("'")) && (last_line.startsWith('"') && last_line.endsWith('"')))) {
                                    pair_action_lines.pop()
                                    pair_action_lines.push("narration: " + last_line)
                                    pair_action = pair_action_lines.join("\n")
                                }

                            let action_statement_pair: any = yaml.load(pair_action)
                            let content: StatementActionPair = <StatementActionPair> {"statement": {}}
                            let allKeys = Object.keys(action_statement_pair)
                            if (allKeys.length == 1) {
                                content["statement"]["subject"] = allKeys[0]
                                content["statement"]["content"] = action_statement_pair[content["statement"]["subject"]]
                            } else {
                                content["statement"]["subject"] = allKeys[allKeys.length - 1]
                                content["statement"]["content"] = action_statement_pair[content["statement"]["subject"]]
                                content["action"] = {}
                                allKeys.pop()
                                for (let action of allKeys) {
                                    let timeMatch = action.match(timere)
                                    if (timeMatch) {
                                        let time = parseInt(timeMatch[1]) * 60 + parseInt(timeMatch[2])
                                        if (timeMatch[3] !== "") {
                                            time += parseInt(timeMatch[3]) / Math.pow(10, timeMatch[3].length)
                                        }
                                        content["action"][time.toString()] = action_statement_pair[action]
                                    } else {
                                        if (!content["action"]['0']) {
                                            content["action"]['0'] = {}
                                        }
                                        content["action"]['0'][action] = action_statement_pair[action]
                                    }
                                    
                                }
                            }
                            script_data["script"][qscript_loc].push(content)
                        }
                    } else if (script_name.ext == ".js") {
                        let script_content: string = <string> fs.readFileSync(path.join(p.path, file), 'utf8')
                        if (!script_data["control"][script_path]) {
                            script_data["control"][script_path] = []
                        }
                        script_data["control"][script_path].push(script_content)
                    }
                }
            }
            allResources = allResources.concat(getAllKeys("file", script_data))
            fs.writeFileSync(path.join(outputPath, script_file_name), JSON.stringify(script_data))
        }
    })

program.parse(process.argv);
