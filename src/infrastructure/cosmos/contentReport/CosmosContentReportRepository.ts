import { ContentReport, ContentReportStatus } from '../../../domain/contentReport/ContentReport';
import { contentReportContainer } from '../cosmosClient';

export async function createContentReport(report: ContentReport): Promise<ContentReport> {
  const { resource } = await contentReportContainer.items.create<ContentReport>(report);
  return resource ?? report;
}

export async function findContentReportById(id: string): Promise<ContentReport | null> {
  try {
    const { resource } = await contentReportContainer.item(id, id).read<ContentReport>();
    return resource || null;
  } catch (error: any) {
    if (error.code === 404) {
      return null;
    }
    throw error;
  }
}

export async function replaceContentReport(report: ContentReport): Promise<ContentReport> {
  const { resource } = await contentReportContainer
    .item(report.id, report.id)
    .replace<ContentReport>(report);
  return resource ?? report;
}

export async function findContentReports(
  filter: { status?: ContentReportStatus },
  page: number,
  pageSize: number,
): Promise<{ reports: ContentReport[]; total: number }> {
  const offset = (page - 1) * pageSize;
  const where = filter.status ? ' WHERE c.status = @status' : '';
  const filterParams = filter.status ? [{ name: '@status', value: filter.status }] : [];

  const countSpec = {
    query: `SELECT VALUE COUNT(1) FROM c${where}`,
    parameters: filterParams,
  };
  const { resources: countResult } = await contentReportContainer.items
    .query<number>(countSpec)
    .fetchAll();
  const total = countResult[0] ?? 0;

  const querySpec = {
    query: `SELECT * FROM c${where} ORDER BY c.receivedAt DESC OFFSET @offset LIMIT @pageSize`,
    parameters: [
      ...filterParams,
      { name: '@offset', value: offset },
      { name: '@pageSize', value: pageSize },
    ],
  };
  const { resources: reports } = await contentReportContainer.items
    .query<ContentReport>(querySpec)
    .fetchAll();

  return { reports: reports ?? [], total };
}
