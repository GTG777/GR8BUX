import type { NextApiRequest, NextApiResponse } from 'next';

type ResponseData = {
  message: string;
  status: string;
};

export default function handler(req: NextApiRequest, res: NextApiResponse<ResponseData>) {
  if (req.method === 'GET') {
    res.status(200).json({
      message: 'Health check passed',
      status: 'ok',
    });
  } else {
    res.status(405).json({
      message: 'Method not allowed',
      status: 'error',
    });
  }
}
