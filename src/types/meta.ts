export interface ProjectMeta {
  name: string;
  langs?: string[];
}

export interface LangMeta {
  entry: string | undefined;
  character: {
    [characterName: string]: {
      [propName: string]: string;
    };
  };
  resources: {
    [propName: string]: string;
  };
}

export interface ProjectBundleMeta {
  name: string;
  langs: string[];
  resources: {
    [lang: string]: string[];
  };
}

export interface ScriptData {
  script: {
    [propName: string]: Array<StatementActionPair>;
  };
  control: {
    [propName: string]: string[];
  };
  entry: string;
  character: LangMeta["character"];
}

export interface StatementActionPair {
  statement: Statement;
  action?: Action;
}

export interface Statement {
  subject: string;
  content: unknown;
}

export interface Action {
  [propName: string]: {
    [propName: string]: unknown;
  };
}
