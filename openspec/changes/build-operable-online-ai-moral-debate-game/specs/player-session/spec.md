## ADDED Requirements

### Requirement: 无账号玩家会话
系统 SHALL 在首次访问时签发不可由客户端选择的 playerId 和安全 HttpOnly 会话，并允许玩家设置 2–20 字符的房间昵称。

#### Scenario: 首次访问
- **WHEN** 浏览器没有有效玩家会话
- **THEN** 服务端建立轻量会话且不要求注册、密码或第三方登录

### Requirement: 席位重连令牌
系统 SHALL 在玩家加入房间后签发绑定 playerId、房间和席位且不可预测的短期重连令牌。

#### Scenario: 有效令牌恢复席位
- **WHEN** 玩家在掉线判负期限内以有效令牌重新连接
- **THEN** 系统恢复原席位并返回最新服务端状态快照

#### Scenario: 无效令牌被拒绝
- **WHEN** 重连令牌过期、篡改或不匹配目标房间
- **THEN** 系统拒绝占用原席位且不泄露房间私有状态

### Requirement: 无账号与管理功能
MVP MUST NOT 提供注册、正式登录、管理员、封禁、额度、付费或身份迁移界面。

#### Scenario: 首页展示
- **WHEN** 玩家打开应用首页
- **THEN** 系统只提供昵称、创建房间和加入房间入口
