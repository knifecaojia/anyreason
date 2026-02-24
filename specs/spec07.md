# 图片模型

千问文生图 ：https://help.aliyun.com/zh/model-studio/qwen-image-api?spm=a2c4g.11186623.help-menu-2400256.d_2_2_0.386d7604Sg3i7c&scm=20140722.H_2975126._.OR_help-T_cn~zh-V_1

阿里z-image文生图：https://help.aliyun.com/zh/model-studio/z-image-api-reference?spm=a2c4g.11186623.help-menu-2400256.d_2_2_3.6ab47604ky56TF

万向文生图v2：https://help.aliyun.com/zh/model-studio/text-to-image-v2-api-reference?spm=a2c4g.11186623.help-menu-2400256.d_2_2_4.63622316YtFY6i&scm=20140722.H_2862677._.OR_help-T_cn~zh-V_1

火山（豆包））seedream4-5 文生图片：https://www.volcengine.com/docs/82379/1824121?redirect=1&lang=zh，api文档：https://www.volcengine.com/docs/82379/1541523?lang=zh

gemini nano banana pro ：https://ai.google.dev/gemini-api/docs/models/gemini-3-pro-image-preview api 说明：https://ai.google.dev/gemini-api/docs/image-generation#python_3

gemini nano banana pro 还有一种生成图片的方案，就是中转API，这种api中转站提供两种访问生图方式：1是 https://vectorengine.apifox.cn/api-381740608 这个文档所示的类似原生api；另一个：https://vectorengine.apifox.cn/api-349239120 openai chat 兼容接口 返回的图片应该是base64编码格式。




万向图生视频-首帧模式：https://help.aliyun.com/zh/model-studio/image-to-video-api-reference/?spm=a2c4g.11186623.help-menu-2400256.d_2_3_0.3de36bd3hkdxij

万向图生视频-首尾帧：https://help.aliyun.com/zh/model-studio/image-to-video-by-first-and-last-frame-api-reference?spm=a2c4g.11186623.help-menu-2400256.d_2_3_1.a5a4795cEQHG6r

万向参考生视频：https://help.aliyun.com/zh/model-studio/wan-video-to-video-api-reference?spm=a2c4g.11186623.help-menu-2400256.d_2_3_2.529c367dJU2y2z

> 火山生成视频任务：https://www.volcengine.com/docs/82379/1520757?lang=zh，查询任务：https://www.volcengine.com/docs/82379/1521309?lang=zh，查询任务列表：https://www.volcengine.com/docs/82379/1521675?lang=zh，取消或删除视频生成任务：https://www.volcengine.com/docs/82379/1521720?lang=zh

以上是火山、阿里、gemini等图片、视频生成的api接口官方文档

我需要你：

1 将上述文档通过各种工具获取内容

2 考虑如何优化当前系统图片、视频模型的数据库模型，将不同的厂家模型的能力限制（分辨率 宽高比等）保存，同时能够在前端调用时供用户选择？

3.你的设计方案要严格首先分析当前系统的实现，不得在我批准你的方案之前修改代码

4 你的spec 输出文档采用中文
