import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  images:{
    remotePatterns:[
      {
        protocol:"https",
        hostname:"*",
        port:"",
        pathname:"/**",
      }
    ]
  },
  async headers(){
    return [
      {
        source:'/:path*',
        headers:[
          {
          key:'Cross-Origin-Embedder-Policy',
          value:'same-origin',
          },
          {
              key:'Cross-Origin-Embedder-Policy',
              value:'require-corp',
          },
        ],
      }
    ]
  }
};

export default nextConfig;
