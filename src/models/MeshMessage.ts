export type MeshMessage = {
    id : string;
    src : string;
    dest : string;
    ttl : number;
    visited : string[];
    body : string;
};

export const serialize = (msg: MeshMessage): string =>
  JSON.stringify(msg);

export const deserialize = (raw: string): MeshMessage =>
  JSON.parse(raw);