import {
  BookOutlined,
  BulbOutlined,
  CameraOutlined,
  CoffeeOutlined,
  CodeOutlined,
  DollarOutlined,
  FileTextOutlined,
  FolderOutlined,
  HeartOutlined,
  HomeOutlined,
  MedicineBoxOutlined,
  PictureOutlined,
  ReadOutlined,
  ShoppingOutlined,
  SkinOutlined,
  TrophyOutlined
} from '@ant-design/icons'

const icons: Record<string, React.ReactNode> = {
  travel: <ShoppingOutlined />,
  health: <MedicineBoxOutlined />,
  code: <CodeOutlined />,
  sport: <TrophyOutlined />,
  food: <SkinOutlined />,
  study: <ReadOutlined />,
  work: <FolderOutlined />,
  photo: <CameraOutlined />,
  family: <HomeOutlined />,
  finance: <DollarOutlined />,
  writing: <FileTextOutlined />,
  school: <BookOutlined />,
  coffee: <CoffeeOutlined />,
  habit: <HeartOutlined />,
  idea: <BulbOutlined />,
  life: <HeartOutlined />,
  folder: <FolderOutlined />,
  ai: <PictureOutlined />
}

export const projectIconOptions = Object.keys(icons)

export default function ProjectIcon({ name }: { name: string }) {
  return <>{icons[name] ?? <FolderOutlined />}</>
}
