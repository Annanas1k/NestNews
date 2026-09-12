import { IsEnum } from 'class-validator';
import { CommentStatus } from '../../generated/prisma/client.js';

export class ModerateCommentDto {
  @IsEnum(CommentStatus)
  status: CommentStatus;
}
