export type MemoryKind =
  'preference' | 'decision' | 'recurring-bug' | 'todo' | 'conversation' | 'summary';

export interface Memory {
  readonly id: string;
  readonly kind: MemoryKind;
  readonly content: string;
  readonly tags: readonly string[];
  /** Higher means more important; influences retrieval ranking. */
  readonly importance: number;
  readonly createdAt: number;
  readonly updatedAt: number;
}

export interface MemoryQuery {
  readonly query: string;
  readonly kinds?: readonly MemoryKind[];
  readonly limit: number;
}

export interface MemoryStore {
  remember(memory: Omit<Memory, 'id' | 'createdAt' | 'updatedAt'>): Promise<Memory>;
  retrieve(query: MemoryQuery): Promise<readonly Memory[]>;
  forget(id: string): Promise<void>;
  all(): Promise<readonly Memory[]>;
}

/* ---------- Knowledge graph ---------- */

export type EntityType =
  | 'person'
  | 'company'
  | 'project'
  | 'repository'
  | 'file'
  | 'document'
  | 'api'
  | 'technology'
  | 'conversation';

export interface Entity {
  readonly id: string;
  readonly type: EntityType;
  readonly name: string;
  readonly properties: Readonly<Record<string, unknown>>;
}

export interface Relation {
  readonly id: string;
  readonly from: string;
  readonly to: string;
  readonly type: string;
  readonly weight: number;
}

export interface GraphTraversal {
  readonly startId: string;
  readonly maxDepth: number;
  readonly relationTypes?: readonly string[];
}

export interface KnowledgeGraph {
  addEntity(entity: Omit<Entity, 'id'>): Promise<Entity>;
  addRelation(relation: Omit<Relation, 'id'>): Promise<Relation>;
  getEntity(id: string): Promise<Entity | undefined>;
  search(query: string, limit: number): Promise<readonly Entity[]>;
  traverse(traversal: GraphTraversal): Promise<readonly Entity[]>;
}
