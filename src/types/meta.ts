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
    [propName: string]: Array<Step>;
  };
  control: {
    [propName: string]: string[];
  };
  entry: string;
  character: LangMeta["character"];
}

export interface Step {
  action: Action;
}

export interface Action {
  [time: string]: {
    [action: string]: unknown;
  };
}
