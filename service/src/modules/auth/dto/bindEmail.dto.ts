import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsNotEmpty, Length, MaxLength } from 'class-validator';

export class SendBindEmailCodeDto {
  @ApiProperty({ example: 'user@example.com', description: '待绑定的邮箱' })
  @IsEmail({}, { message: '请填写有效的邮箱地址' })
  @IsNotEmpty({ message: '邮箱不能为空' })
  @MaxLength(64, { message: '邮箱长度不能超过64个字符' })
  email: string;
}

export class VerifyBindEmailDto {
  @ApiProperty({ example: 'user@example.com' })
  @IsEmail({}, { message: '请填写有效的邮箱地址' })
  @IsNotEmpty()
  @MaxLength(64)
  email: string;

  @ApiProperty({ example: '123456', description: '邮件中的6位验证码' })
  @IsNotEmpty({ message: '请输入验证码' })
  @Length(6, 6, { message: '验证码为6位数字' })
  code: string;
}
