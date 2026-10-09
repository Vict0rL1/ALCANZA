export declare function parseSchemaVersion(source: string | null | undefined): number | null
export declare function schemaFrom(arg: string, readTypes: (ref: string) => string | null): number
export declare function canRollback(from: number, to: number): { ok: boolean; reason: string }
export declare function deploymentMessage(schema: number, sha: string): string
