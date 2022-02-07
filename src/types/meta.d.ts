interface ProjectMeta {
    name: string
    langs: Array | undefined
}

interface LangMeta {
    entry: string | undefined
}

interface SectionMeta {
    entry: string | undefined
    character: {
        [propName: string]: {
            show: string
            color?: string
            [propName: string]: string
        }
    }
    resources: {
        [propName: string]: string
    }
}

interface MetaData {
    
}

interface ScriptData {
    script: {
        [propName: string]: Array<StatementActionPair>
    }
    control: {
        [propName: string]: string[]
    }
    entry: {
        [propName: string]: string
    }
}

interface StatementActionPair {
    statement: Statement
    action?: Action
}

interface Statement {
    subject: string
    content: any
}

interface Action {
    [propName: string]: {
        [propName: string]: any
    }
}