import { Templates, UserRole } from "@prisma/client";
import { randomUUID } from "crypto";

interface UserRecord {
  id: string;
  name?: string | null;
  email: string;
  image?: string | null;
  role: UserRole;
  createdAt: Date;
  updatedAt: Date;
}

interface AccountRecord {
  id: string;
  userId: string;
  type: string;
  provider: string;
  providerAccountId: string;
  refreshToken?: string | null;
  accessToken?: string | null;
  expiresAt?: number | null;
  tokenType?: string | null;
  scope?: string | null;
  idToken?: string | null;
  sessionState?: string | null;
  createdAt: Date;
  updatedAt: Date;
}

interface PlaygroundRecord {
  id: string;
  title: string;
  description: string;
  template: Templates;
  userId: string;
  createdAt: Date;
  updatedAt: Date;
}

interface TemplateFileRecord {
  id: string;
  playgroundId: string;
  content: string;
  createdAt: Date;
  updatedAt: Date;
}

interface StarMarkRecord {
  id: string;
  userId: string;
  playgroundId: string;
  isMarked: boolean;
  createdAt: Date;
}

type PlaygroundIncludeArgs = {
  user?: boolean;
  Starmark?: {
    where?: { userId?: string };
    select?: { isMarked?: boolean };
  };
  templateFiles?: TemplateFileSelection;
};

type TemplateFileSelection =
  | boolean
  | {
      select?: {
        id?: boolean;
        playgroundId?: boolean;
        content?: boolean;
        createdAt?: boolean;
        updatedAt?: boolean;
      };
    };

type PlaygroundSelectArgs = {
  id?: boolean;
  title?: boolean;
  description?: boolean;
  template?: boolean;
  userId?: boolean;
  createdAt?: boolean;
  updatedAt?: boolean;
  templateFiles?: TemplateFileSelection;
};

const clone = <T>(value: T): T => {
  if (value instanceof Date) {
    return new Date(value.getTime()) as unknown as T;
  }

  if (Array.isArray(value)) {
    return value.map((item) => clone(item)) as unknown as T;
  }

  if (value && typeof value === "object") {
    if (value instanceof Map) {
      return new Map(
        Array.from(value.entries()).map(([key, nested]) => [key, clone(nested)])
      ) as unknown as T;
    }

    if (value instanceof Set) {
      return new Set(Array.from(value.values()).map((item) => clone(item))) as unknown as T;
    }

    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([key, nested]) => [
        key,
        clone(nested),
      ])
    ) as T;
  }

  return value;
};

const materializeTemplateFiles = (
  records: TemplateFileRecord[],
  selection?: TemplateFileSelection
) => {
  if (!records.length) {
    return [];
  }

  if (!selection || selection === true) {
    return records.map((record) => clone(record));
  }

  const select = selection.select;
  if (!select) {
    return records.map((record) => clone(record));
  }

  return records.map((record) => {
    const result: Record<string, unknown> = {};

    if (select.id) result.id = record.id;
    if (select.playgroundId) result.playgroundId = record.playgroundId;
    if (select.content) result.content = record.content;
    if (select.createdAt) result.createdAt = clone(record.createdAt);
    if (select.updatedAt) result.updatedAt = clone(record.updatedAt);

    return result;
  });
};

const applyPlaygroundSelect = (
  record: PlaygroundRecord,
  templateFiles: TemplateFileRecord[],
  select?: PlaygroundSelectArgs
) => {
  if (!select) {
    return clone(record);
  }

  const result: Record<string, unknown> = {};

  if (select.id) result.id = record.id;
  if (select.title) result.title = record.title;
  if (select.description) result.description = record.description;
  if (select.template) result.template = record.template;
  if (select.userId) result.userId = record.userId;
  if (select.createdAt) result.createdAt = clone(record.createdAt);
  if (select.updatedAt) result.updatedAt = clone(record.updatedAt);
  if (select.templateFiles) {
    result.templateFiles = materializeTemplateFiles(
      templateFiles,
      select.templateFiles
    );
  }

  return result;
};

const applyPlaygroundInclude = (
  record: PlaygroundRecord,
  user: UserRecord | null,
  starMarks: StarMarkRecord[],
  templateFiles: TemplateFileRecord[],
  include?: PlaygroundIncludeArgs
) => {
  if (!include) {
    return clone(record);
  }

  const result = clone(record) as Record<string, unknown>;

  if (include.user) {
    result.user = user ? clone(user) : null;
  }

  if (include.Starmark) {
    const { where, select } = include.Starmark;
    const filtered = starMarks.filter((mark) => {
      if (where?.userId && mark.userId !== where.userId) {
        return false;
      }
      return mark.playgroundId === record.id;
    });

    if (select?.isMarked) {
      result.Starmark = filtered.map((mark) => ({ isMarked: mark.isMarked }));
    } else {
      result.Starmark = filtered.map((mark) => ({ ...clone(mark) }));
    }
  }

  if (include.templateFiles) {
    result.templateFiles = materializeTemplateFiles(
      templateFiles,
      include.templateFiles
    );
  }

  return result;
};

export class MockPrismaClient {
  private users = new Map<string, UserRecord>();
  private accounts = new Map<string, AccountRecord>();
  private playgrounds = new Map<string, PlaygroundRecord>();
  private templateFiles = new Map<string, TemplateFileRecord>();
  private starMarks = new Map<string, StarMarkRecord>();

  constructor() {
    const now = new Date();
    const defaultUser: UserRecord = {
      id: "mock-user-1",
      name: "Mock User",
      email: "mock.user@example.com",
      image: null,
      role: UserRole.USER,
      createdAt: now,
      updatedAt: now,
    };

    const defaultAccount: AccountRecord = {
      id: "mock-account-1",
      userId: defaultUser.id,
      type: "credentials",
      provider: "mock",
      providerAccountId: defaultUser.email,
      refreshToken: null,
      accessToken: null,
      expiresAt: null,
      tokenType: null,
      scope: null,
      idToken: null,
      sessionState: null,
      createdAt: now,
      updatedAt: now,
    };

    this.users.set(defaultUser.id, defaultUser);
    this.accounts.set(defaultAccount.id, defaultAccount);
  }

  user = {
    findUnique: async (args: { where?: { id?: string }; include?: { account?: boolean } }) => {
      const id = args?.where?.id;
      if (!id) {
        return null;
      }

      const user = this.users.get(id);
      if (!user) {
        return null;
      }

      if (!args?.include?.account) {
        return clone(user);
      }

      const accounts = Array.from(this.accounts.values()).filter(
        (account) => account.userId === id
      );

      return {
        ...clone(user),
        account: accounts.map((account) => clone(account)),
      };
    },
  };

  account = {
    findFirst: async (args: { where?: { userId?: string } }) => {
      const userId = args?.where?.userId;
      if (!userId) {
        return null;
      }

      const account = Array.from(this.accounts.values()).find(
        (item) => item.userId === userId
      );

      return account ? clone(account) : null;
    },
  };

  playground = {
    create: async (args: { data: { title: string; description: string; template: Templates; userId: string } }) => {
      const now = new Date();
      const id = randomUUID();
      const record: PlaygroundRecord = {
        id,
        title: args.data.title,
        description: args.data.description,
        template: args.data.template,
        userId: args.data.userId,
        createdAt: now,
        updatedAt: now,
      };

      this.playgrounds.set(id, record);

      return clone(record);
    },

    findMany: async (args?: { where?: { userId?: string }; include?: PlaygroundIncludeArgs }) => {
      const whereUserId = args?.where?.userId;
      const include = args?.include;

      const playgrounds = Array.from(this.playgrounds.values()).filter((item) => {
        if (whereUserId) {
          return item.userId === whereUserId;
        }
        return true;
      });

      return playgrounds.map((record) =>
        applyPlaygroundInclude(
          record,
          this.users.get(record.userId) ?? null,
          Array.from(this.starMarks.values()),
          this.collectTemplateFiles(record.id),
          include
        )
      );
    },

    delete: async (args: { where: { id: string } }) => {
      const id = args.where.id;
      const existing = this.playgrounds.get(id);
      if (!existing) {
        throw new Error(`Playground with id "${id}" not found.`);
      }

      this.playgrounds.delete(id);
      this.templateFiles.delete(id);
      Array.from(this.starMarks.values())
        .filter((mark) => mark.playgroundId === id)
        .forEach((mark) => this.starMarks.delete(mark.id));

      return clone(existing);
    },

    update: async (args: { where: { id: string }; data: { title?: string; description?: string } }) => {
      const id = args.where.id;
      const existing = this.playgrounds.get(id);
      if (!existing) {
        throw new Error(`Playground with id "${id}" not found.`);
      }

      const updated: PlaygroundRecord = {
        ...existing,
        title: args.data.title ?? existing.title,
        description: args.data.description ?? existing.description,
        updatedAt: new Date(),
      };

      this.playgrounds.set(id, updated);

      return clone(updated);
    },

    findUnique: async (args: {
      where: { id: string };
      include?: PlaygroundIncludeArgs;
      select?: PlaygroundSelectArgs;
    }) => {
      const id = args.where.id;
      const record = this.playgrounds.get(id);
      if (!record) {
        return null;
      }

      if (args.select) {
        return applyPlaygroundSelect(
          record,
          this.collectTemplateFiles(id),
          args.select
        );
      }

      return applyPlaygroundInclude(
        record,
        this.users.get(record.userId) ?? null,
        Array.from(this.starMarks.values()),
        this.collectTemplateFiles(id),
        args.include
      );
    },
  };

  templateFile = {
    upsert: async (args: {
      where: { playgroundId: string };
      update: { content?: string };
      create: { playgroundId: string; content: string };
    }) => {
      const { playgroundId } = args.where;
      const existing = this.templateFiles.get(playgroundId);

      if (existing) {
        const updated: TemplateFileRecord = {
          ...existing,
          content: args.update.content ?? existing.content,
          updatedAt: new Date(),
        };

        this.templateFiles.set(playgroundId, updated);
        return clone(updated);
      }

      const now = new Date();
      const created: TemplateFileRecord = {
        id: randomUUID(),
        playgroundId,
        content: args.create.content,
        createdAt: now,
        updatedAt: now,
      };

      this.templateFiles.set(playgroundId, created);
      return clone(created);
    },
  };

  private collectTemplateFiles(playgroundId: string) {
    const templateFile = this.templateFiles.get(playgroundId);
    return templateFile ? [templateFile] : [];
  }
}
