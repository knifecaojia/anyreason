
我需要你重新审慎的设计video ai provider 分析当前的厂商-模型-配置这种三级模式是否能够应对当前的vidu 海螺 可灵 即梦 sora2 veo3 grok等多种视频生成模型的api接入
我们是否需要重构视频模型配置逻辑 是否可以在当前的实现上扩展？
主要的矛盾：
每个模型的能力不同，支持的输入配置，参考图数量等等各不相同，在模型配置页面无法针对不同的模型手工设置，这样导致在前端调用模型的时候存在 输入参数设置不清晰，不匹配的问题
针对以上，我建议直接通过模型硬编码的方式来确定。因为厂家模型数量非常有限，无需通过数据库配置为后续保留扩展的机会，硬编码是最合理的。

我们需要实现的模型

第一期
vidu
参考生视频：https://platform.vidu.cn/docs/reference-to-video
图生视频 ：https://platform.vidu.cn/docs/image-to-video
首尾帧生视频：https://platform.vidu.cn/docs/start-end-to-video
智能多帧生视频：https://platform.vidu.cn/docs/multi-frame

主要实现以上四中模式
模型清单：https://platform.vidu.cn/docs/model-map
需要实现的模型 viduQ3，viduq2-pro-fast	viduq2-turbo	viduq2-pro	viduq2
要注意支持的分辨率 生成时长 支持的模式


vidu 任务接口：
上述创建任务接口后，其他任务接口包括
查询生成接口：https://platform.vidu.cn/docs/search-task-api
查询任务列表：https://platform.vidu.cn/docs/tasks-list
取消任务接口：https://platform.vidu.cn/docs/cancel-task-api
查询积分接口：https://platform.vidu.cn/docs/search-credits

