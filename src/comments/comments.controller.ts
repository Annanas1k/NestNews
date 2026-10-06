import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { CommentsService } from './comments.service';
import { CreateCommentDto } from './dto/create-comment.dto';
import { ModerateCommentDto } from './dto/moderate-comment.dto';
import { FindCommentsDto } from './dto/find-comments.dto';
import { CurrentUser, CurrentUserPayload } from '../common/decorators/current-user.decorator';

@Controller()
export class CommentsController {
  constructor(private readonly commentsService: CommentsService) {}

  @Post('comments')
  @HttpCode(HttpStatus.CREATED)
  create(
    @Body() dto: CreateCommentDto,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    return this.commentsService.create(dto, user.id);
  }

  @Get('articles/:articleId/comments')
  @HttpCode(HttpStatus.OK)
  findApprovedByArticle(
    @Param('articleId', ParseUUIDPipe) articleId: string,
  ) {
    return this.commentsService.findApprovedByArticle(articleId);
  }

  @Get('comments/pending')
  @HttpCode(HttpStatus.OK)
  findPending(@Query() query: FindCommentsDto) {
    return this.commentsService.findPending(query);
  }

  @Patch('comments/:id/moderate')
  @HttpCode(HttpStatus.OK)
  moderate(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ModerateCommentDto,
  ) {
    return this.commentsService.moderate(id, dto);
  }

  @Delete('comments/:id')
  @HttpCode(HttpStatus.OK)
  remove(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    return this.commentsService.remove(id, user);
  }
}
