# Scraped Content from https://platform.vidu.cn/docs/text-to-video

Vidu API
体验台
工作台
文档
登录
完善信息，赢取Vidu API积分福利！填写真实信息即可确保奖励快速到账。
开始填写
概览
7
平台介绍
产品定价
场景示例中心
HOT
Vidu主体示例中心
HOT
常见问题
功能清单
模型地图
接口文档
7
更新公告
创建视频任务
参考生视频
文生视频
图生视频
首尾帧生视频
智能多帧
场景特效模版
模版成片
创建图像任务
图片生成
创建音频任务
文生音频
可控文生音效
语音合成
声音复刻
创建其他任务
动作同步
视频延长
对口型
数字人
推荐提示词接口
智能超清-尊享
解决方案
一键生成通用成片
一键生成电商成片
一键生成AI-MV
一键生成视频复刻
任务管理
查询生成物接口
查询任务列表
取消任务接口
查询积分接口
回调签名算法
错误码清单
模型微调
3
微调概述
使用步骤
数据准备
创建微调任务
API调用
常见问题
MCP 服务
2
Vidu MCP 使用指南
MCP接入
MCP Stdio 协议
Streamable Http 协议
常见问题
条款和协议
3
用户协议
隐私协议
充值协议
文生视频
调试
POST https://api.vidu.cn/ent/v2/text2video
请求头
字段 值 描述
Content-Type application/json 数据交换格式
Authorization Token {your api key} 将 {your api key} 替换为您的 token
请求体
参数名称 类型 必填 参数描述
model String 是 模型名称
可选值：viduq3-turbo 、viduq3-pro 、viduq2 、viduq1
- viduq3-turbo：对比viduq3-pro，生成速度更快
- viduq3-pro：高效生成优质音视频内容，让视频内容更生动、更形象、更立体，效果更好
- viduq2：最新模型
- viduq1：画面清晰，平滑转场，运镜稳定
style String 可选 风格
默认 general，可选值：general、anime
general：通用风格，可以通过提示词来控制风格
anime：动漫风格，仅在动漫风格表现突出，可以通过不同的动漫风格提示词来控制
注：使用q2、q3系列模型时该参数不生效
prompt String 是 文本提示词
生成视频的文本描述。
注：字符长度不能超过 5000 个字符
duration Int 可选 视频时长参数，默认值依据模型而定：
- viduq3-pro、viduq3-turbo: 默认5秒，可选：1-16
- viduq2 : 默认5秒，可选：1-10
- viduq1 : 默认5秒，可选：5
seed Int 可选 随机种子
当默认不传或者传0时，会使用随机数替代
手动设置则使用设置的种子
aspect_ratio String 可选 比例
默认 16:9，可选值：16:9、9:16、3:4、4:3、1:1
注：3:4、4:3仅支持q2、q3系列模型
resolution String 可选 分辨率参数，默认值依据模型和视频时长而定：
- viduq3-pro、viduq3-turbo(1-16秒)：默认 720p，可选：540p、720p、1080p
- viduq2(1-10秒)：默认 720p，可选：540p、720p、1080p
- viduq1(5秒)：默认 1080p，可选：1080p
movement_amplitude String 可选 运动幅度
默认 auto，可选值：auto、small、medium、large
注：使用q2、q3系列模型时该参数不生效
bgm Bool 可选 是否为生成的视频添加背景音乐。
默认：false，可选值 true 、false
传 true 时系统将从预设 BGM 库中自动挑选合适的音乐并添加；不传或为 false 则不添加 BGM。
- BGM不限制时长，系统根据视频时长自动适配
- BGM参数在q2模型的duration为 9秒 或 10秒 时不生效；该参数在q3系列模型中不生效
audio Bool 可选 是否使用音视频直出能力，默认为true，枚举值为：
- false：不需要音视频直出，输出静音视频
- true：需要音画同步，输出声音的视频（包括台词和音效）
注1：仅q3系列模型支持该参数
payload String 可选 透传参数
不做任何处理，仅数据传输
注：最多 1048576个字符
off_peak Bool 可选 错峰模式，默认为：false，可选值：
- true：错峰生成视频；
- false：即时生成视频；
注1：错峰模式消耗的积分更低，具体请查看产品定价
注2：错峰模式下提交的任务，会在48小时内生成，未能完成的任务会被自动取消，并返还该任务的积分；
注3：您也可以手动取消错峰任务
watermark Bool 可选 是否添加水印
- true：添加水印；
- false：不添加水印；
注1：目前水印内容为固定，内容由AI生成，默认不加
注2：您可以通过watermarked_url参数查询获取带水印的视频内容，详情见查询任务接口
wm_position Int 可选 水印位置，表示水印出现在图片的位置，可选项为：
1：左上角
2：右上角
3：右下角
4：左下角
默认为：3
wm_url String 可选 水印内容，此处为图片URL
不传时，使用默认水印：内容由AI生成
meta_data String 可选 元数据标识，json格式字符串，透传字段，您可以 自定义格式 或使用 示例格式 ，示例如下：
{
"Label": "your_label","ContentProducer": "yourcontentproducer","ContentPropagator": "your_content_propagator","ProduceID": "yourproductid", "PropagateID": "your_propagate_id","ReservedCode1": "yourreservedcode1", "ReservedCode2": "your_reserved_code2"
}
该参数为空时，默认使用vidu生成的元数据标识
callback_url String 可选 Callback 协议
需要您在创建任务时主动设置 callback_url，请求方法为 POST，当视频生成任务有状态变化时，Vidu 将向此地址发送包含任务最新状态的回调请求。回调请求内容结构与查询任务API的返回体一致
回调返回的"status"包括以下状态：
- processing 任务处理中
- success 任务完成（如发送失败，回调三次）
- failed 任务失败（如发送失败，回调三次）
Vidu采用回调签名算法进行认证，详情见：回调签名算法
curl -X POST -H "Authorization: Token {your_api_key}" -H "Content-Type: application/json" -d '
{
    "model": "viduq3-pro",
    "style": "general",
    "prompt": "In an ultra-realistic fashion photography style featuring light blue and pale amber tones, an astronaut in a spacesuit walks through the fog. The background consists of enchanting white and golden lights, creating a minimalist still life and an impressive panoramic scene.",
    "duration": 5,
    "seed": 0,
    "aspect_ratio": "4:3",
    "resolution": "540p",
    "movement_amplitude": "auto",
    "off_peak": false
}' https://api.vidu.cn/ent/v2/text2video
响应体
字段 类型 描述
task_id String Vidu 生成的任务ID
state String 处理状态
可选值：
created 创建成功
queueing 任务排队中
processing 任务处理中
success 任务成功
failed 任务失败
model String 本次调用的模型名称
prompt String 本次调用的提示词参数
duration Int 本次调用的视频时长参数
seed Int 本次调用的随机种子参数
aspect_ratio String 本次调用的 比例 参数
resolution String 本次调用的分辨率参数
bgm Bool 本次调用的背景音乐参数
movement_amplitude String 本次调用的镜头动态幅度参数
payload String 本次调用时传入的透传参数
off_peak Bool 本次调用时是否使用错峰模式
credits Int 本次调用使用的积分数
watermark Bool 本次提交任务是否使用水印
created_at String 任务创建时间
{
  "task_id": "your_task_id_here",
  "state": "created",
  "model": "viduq3-pro",
  "style": "general",
  "prompt": "In an ultra-realistic fashion photography style featuring light blue and pale amber tones, an astronaut in a spacesuit walks through the fog. The background consists of enchanting white and golden lights, creating a minimalist still life and an impressive panoramic scene.",
  "duration": 5,
  "seed": random_number,
  "aspect_ratio": "4:3",
  "resolution": "540p",
  "movement_amplitude": "auto",
  "payload":"",
  "off_peak": false,
  "credits": credits_number,
  "created_at": "2025-01-01T15:41:31.968916Z"
}
当前页面
目录
请求头
请求体
响应体
积分申请

## Links found:
- [平台介绍](https://platform.vidu.cn/docs/introduction)
- [产品定价](https://platform.vidu.cn/docs/pricing)
- [场景示例中心
HOT](https://platform.vidu.cn/docs/templates)
- [Vidu主体示例中心
HOT](https://platform.vidu.cn/docs/subjects-library)
- [常见问题](https://platform.vidu.cn/docs/faq)
- [功能清单](https://platform.vidu.cn/docs/function-list)
- [模型地图](https://platform.vidu.cn/docs/model-map)
- [更新公告](https://platform.vidu.cn/docs/update)
- [参考生视频](https://platform.vidu.cn/docs/reference-to-video)
- [文生视频](https://platform.vidu.cn/docs/text-to-video)
- [图生视频](https://platform.vidu.cn/docs/image-to-video)
- [首尾帧生视频](https://platform.vidu.cn/docs/start-end-to-video)
- [智能多帧](https://platform.vidu.cn/docs/multi-frame)
- [场景特效模版](https://platform.vidu.cn/docs/template)
- [模版成片](https://platform.vidu.cn/docs/template-story)
- [图片生成](https://platform.vidu.cn/docs/reference-to-image)
- [文生音频](https://platform.vidu.cn/docs/text-to-audio)
- [可控文生音效](https://platform.vidu.cn/docs/timing-to-audio)
- [语音合成](https://platform.vidu.cn/docs/text-to-speech)
- [声音复刻](https://platform.vidu.cn/docs/voice-clone)
- [动作同步](https://platform.vidu.cn/docs/motion-sync)
- [视频延长](https://platform.vidu.cn/docs/video-extension)
- [对口型](https://platform.vidu.cn/docs/lip-sync)
- [数字人](https://platform.vidu.cn/docs/digital-human)
- [推荐提示词接口](https://platform.vidu.cn/docs/prompt-rec)
- [智能超清-尊享](https://platform.vidu.cn/docs/upscale-pro)
- [一键生成通用成片](https://platform.vidu.cn/docs/one-click-general-film)
- [一键生成电商成片](https://platform.vidu.cn/docs/one-click-ad-film)
- [一键生成AI-MV](https://platform.vidu.cn/docs/one-click-ai-mv)
- [一键生成视频复刻](https://platform.vidu.cn/docs/one-click-trending-replicate)
- [查询生成物接口](https://platform.vidu.cn/docs/search-task-api)
- [查询任务列表](https://platform.vidu.cn/docs/tasks-list)
- [取消任务接口](https://platform.vidu.cn/docs/cancel-task-api)
- [查询积分接口](https://platform.vidu.cn/docs/search-credits)
- [回调签名算法](https://platform.vidu.cn/docs/callback-signature)
- [错误码清单](https://platform.vidu.cn/docs/error-code)
- [微调概述](https://platform.vidu.cn/docs/fine-tuning)
- [数据准备](https://platform.vidu.cn/docs/fine-tuning-data)
- [创建微调任务](https://platform.vidu.cn/docs/fine-tuning-create)
- [API调用](https://platform.vidu.cn/docs/fine-tuning-api)
- [常见问题](https://platform.vidu.cn/docs/fine-tuning-faq)
- [Vidu MCP 使用指南](https://platform.vidu.cn/docs/mcp-overview)
- [MCP Stdio 协议](https://platform.vidu.cn/docs/mcp-stdio)
- [Streamable Http 协议](https://platform.vidu.cn/docs/mcp-streamable-https)
- [常见问题](https://platform.vidu.cn/docs/mcp-faq)
- [用户协议](https://platform.vidu.cn/docs/user-policy)
- [隐私协议](https://platform.vidu.cn/docs/privacy-policy)
- [充值协议](https://platform.vidu.cn/docs/top-up-policy)
- [产品定价](https://platform.vidu.cn/docs/pricing)
- [手动取消](https://platform.vidu.cn/docs/cancel-task-api)
- [查询任务接口](https://platform.vidu.cn/docs/search-task-api)
- [回调签名算法](https://platform.vidu.cn/docs/callback-signature)
