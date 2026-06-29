import type { Entity, GraphTraversal, KnowledgeGraph, Relation } from '@forgewright/types';

export interface KnowledgeGraphOptions {
  readonly generateId?: () => string;
}

/**
 * In-memory semantic knowledge graph of entities and weighted relations.
 * `traverse` does a breadth-first walk (treating edges as undirected for
 * retrieval breadth) up to `maxDepth`, optionally restricted to relation types.
 */
export class InMemoryKnowledgeGraph implements KnowledgeGraph {
  private readonly entities = new Map<string, Entity>();
  private readonly relations: Relation[] = [];
  /** Adjacency: entityId -> list of {neighborId, relationType}. */
  private readonly adjacency = new Map<string, { to: string; type: string }[]>();
  private readonly generateId: () => string;

  constructor(options: KnowledgeGraphOptions = {}) {
    this.generateId = options.generateId ?? (() => crypto.randomUUID());
  }

  async addEntity(entity: Omit<Entity, 'id'>): Promise<Entity> {
    const created: Entity = {
      id: this.generateId(),
      type: entity.type,
      name: entity.name,
      properties: { ...entity.properties },
    };
    this.entities.set(created.id, created);
    return created;
  }

  async addRelation(relation: Omit<Relation, 'id'>): Promise<Relation> {
    const created: Relation = { id: this.generateId(), ...relation };
    this.relations.push(created);
    this.link(created.from, created.to, created.type);
    this.link(created.to, created.from, created.type);
    return created;
  }

  private link(from: string, to: string, type: string): void {
    const list = this.adjacency.get(from) ?? [];
    list.push({ to, type });
    this.adjacency.set(from, list);
  }

  async getEntity(id: string): Promise<Entity | undefined> {
    return this.entities.get(id);
  }

  async search(query: string, limit: number): Promise<readonly Entity[]> {
    const q = query.toLowerCase();
    const terms = q.split(/\s+/).filter((t) => t.length > 0);
    const scored: { entity: Entity; score: number }[] = [];
    for (const entity of this.entities.values()) {
      const hay =
        `${entity.name} ${entity.type} ${JSON.stringify(entity.properties)}`.toLowerCase();
      let score = 0;
      for (const term of terms) if (hay.includes(term)) score += 1;
      if (entity.name.toLowerCase() === q) score += 5;
      if (score > 0) scored.push({ entity, score });
    }
    scored.sort((a, b) => b.score - a.score || a.entity.name.localeCompare(b.entity.name));
    return scored.slice(0, limit).map((s) => s.entity);
  }

  async traverse(traversal: GraphTraversal): Promise<readonly Entity[]> {
    const allowed = traversal.relationTypes ? new Set(traversal.relationTypes) : undefined;
    const visited = new Set<string>([traversal.startId]);
    const result: Entity[] = [];
    let frontier: string[] = [traversal.startId];

    for (let depth = 0; depth < traversal.maxDepth; depth += 1) {
      const next: string[] = [];
      for (const id of frontier) {
        for (const edge of this.adjacency.get(id) ?? []) {
          if (allowed && !allowed.has(edge.type)) continue;
          if (visited.has(edge.to)) continue;
          visited.add(edge.to);
          const entity = this.entities.get(edge.to);
          if (entity) {
            result.push(entity);
            next.push(edge.to);
          }
        }
      }
      if (next.length === 0) break;
      frontier = next;
    }

    return result;
  }
}
