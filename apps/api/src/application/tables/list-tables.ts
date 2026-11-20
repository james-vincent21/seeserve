import type { Table, TableRepository } from '../../domain/tables/table.js';

export class ListTables {
  constructor(private readonly tables: TableRepository) {}
  execute(): Promise<Table[]> {
    return this.tables.list();
  }
}
