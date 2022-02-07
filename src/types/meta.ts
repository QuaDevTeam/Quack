export interface ProjectMeta {
  name: string;
  langs?: string[];
}

export interface LangMeta {
  entry: string | undefined;
  character: {
    [characterName: string]: {
      show: string;
      color?: string;
      [propName: string]: string | undefined;
    };
  };
  resources: {
    [propName: string]: string;
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
