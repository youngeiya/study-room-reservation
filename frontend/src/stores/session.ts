import { computed, ref } from 'vue'
import { defineStore } from 'pinia'
import { api } from '@/api'
import type { Role, Student } from '@/api/types'

const KEY_ROLE = 'sr.role'
const KEY_STUDENT = 'sr.studentId'

// localStorage 는 막혀 있는 환경(시크릿 모드 등)이 있어서 실패해도 앱이 동작해야 한다.
function read(key: string): string | null {
  try {
    return localStorage.getItem(key)
  } catch {
    return null
  }
}
function write(key: string, value: string) {
  try {
    localStorage.setItem(key, value)
  } catch {
    // 저장하지 못해도 이번 접속에서는 메모리 상태로 계속 동작한다
  }
}

/**
 * "지금 누구로 보고 있는가"를 담는 저장소. 이 과제는 로그인이 없으므로
 * 화면에서 강사/학생(그리고 어떤 학생인지)을 고르는 값이 로그인을 대신한다.
 */
export const useSessionStore = defineStore('session', () => {
  const role = ref<Role>(read(KEY_ROLE) === 'STUDENT' ? 'STUDENT' : 'INSTRUCTOR')
  const studentId = ref<number | null>(Number(read(KEY_STUDENT)) || null)
  const students = ref<Student[]>([])

  const isInstructor = computed(() => role.value === 'INSTRUCTOR')
  const currentStudent = computed(
    () => students.value.find((s) => s.id === studentId.value) ?? null,
  )

  function setRole(next: Role) {
    role.value = next
    write(KEY_ROLE, next)
  }

  function setStudent(id: number) {
    studentId.value = id
    write(KEY_STUDENT, String(id))
  }

  /** 학생 목록을 불러오고, 선택된 학생이 없거나 사라졌으면 첫 학생을 고른다. */
  async function loadStudents() {
    students.value = await api.listStudents()
    const first = students.value[0]
    if (!currentStudent.value && first) setStudent(first.id)
  }

  return {
    role,
    studentId,
    students,
    isInstructor,
    currentStudent,
    setRole,
    setStudent,
    loadStudents,
  }
})
