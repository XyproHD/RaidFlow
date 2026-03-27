import 'next-auth';

declare module 'next-auth' {
  interface Session {
    userId: string;
    discordId: string;
  }
}

declare module 'next-auth/jwt' {
  interface JWT {
    uid?: string;
    discordId?: string;
    discordAccessToken?: string;
  }
}
