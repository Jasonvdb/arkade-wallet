import MainHeader from '../../components/Header'
import { useContext } from 'react'
import { OptionsContext } from '../../providers/options'

interface HeaderProps {
  auxFunc?: () => void
  auxText?: string
  backFunc?: () => void
  back?: boolean
  backTestId?: string
  text: string
}

export default function Header({ auxFunc, auxText, backFunc, back, backTestId, text }: HeaderProps) {
  const { goBack } = useContext(OptionsContext)

  return (
    <MainHeader
      auxFunc={auxFunc}
      auxText={auxText}
      back={backFunc ? backFunc : back ? goBack : undefined}
      backTestId={backTestId}
      heading={false}
      text={text}
    />
  )
}
